import type { LoaderDefinition, LoaderContext } from 'webpack';
import url from 'url';

import * as acorn from 'acorn-loose';

type AcornProgram = ReturnType<typeof acorn.parse>['body'];

function addExportNames(names: Array<string>, node: any) {
  switch (node.type) {
    case 'Identifier':
      names.push(node.name);
      return;
    case 'ObjectPattern':
      for (let i = 0; i < node.properties.length; i++)
        addExportNames(names, node.properties[i]);
      return;
    case 'ArrayPattern':
      for (let i = 0; i < node.elements.length; i++) {
        const element = node.elements[i];
        if (element) addExportNames(names, element);
      }
      return;
    case 'Property':
      addExportNames(names, node.value);
      return;
    case 'AssignmentPattern':
      addExportNames(names, node.left);
      return;
    case 'RestElement':
      addExportNames(names, node.argument);
      return;
    case 'ParenthesizedExpression':
      addExportNames(names, node.expression);
      return;
  }
}

async function parseExportNamesInto(
  loader: LoaderContext<{}>,
  body: AcornProgram,
  names: Array<string>,
  parentModulePath: string,
): Promise<void> {
  for (let i = 0; i < body.length; i++) {
    const node = body[i];
    switch (node.type) {
      case 'ExportAllDeclaration':
        if (node.exported) {
          addExportNames(names, node.exported);
          continue;
        } else {

          const resolve = loader.getResolve({
            conditionNames: ['node', 'import'],
            dependencyType: 'module'
          });

          if (typeof node.source.value !== 'string') {
            throw new Error('Expected the node value to be string.');
          }
          console.log("resolving ", parentModulePath, node.source.value);
          const modulePath = await resolve(parentModulePath, node.source.value);

          const source = await new Promise(resolve => {
            loader.loadModule(modulePath, (err, source) => {
              if (err) { resolve(err); return; }
              resolve(source);
            })
          });

          if (typeof source !== 'string') {
            throw new Error('Expected the transformed source to be a string.');
          }

          let childBody;
          try {
            childBody = acorn.parse(source, {
              ecmaVersion: 2024,
              sourceType: 'module',
            }).body;
          } catch (x) {
            // eslint-disable-next-line react-internal/no-production-logging
            console.error('Error parsing %s %s', modulePath, x instanceof Error ? x.message : String(x));
            continue;
          }
          await parseExportNamesInto(loader, childBody, names, modulePath);
          continue;
        }
      case 'ExportDefaultDeclaration':
        names.push('default');
        continue;
      case 'ExportNamedDeclaration':
        if (node.declaration) {
          if (node.declaration.type === 'VariableDeclaration') {
            const declarations = node.declaration.declarations;
            for (let j = 0; j < declarations.length; j++) {
              addExportNames(names, declarations[j].id);
            }
          } else {
            addExportNames(names, node.declaration.id);
          }
        }
        if (node.specifiers) {
          const specifiers = node.specifiers;
          for (let j = 0; j < specifiers.length; j++) {
            addExportNames(names, specifiers[j].exported);
          }
        }
        continue;
    }
  }
}

async function transformClientModule(loader: LoaderContext<{}>, source: string, body: AcornProgram, resourcePath: string) {

  const names: Array<string> = [];

  await parseExportNamesInto(loader, body, names, resourcePath);

  if (names.length === 0) {
    return '';
  }

  const moduleId = url.pathToFileURL(resourcePath).href;

  let newSrc =
    'import {registerClientReference} from "react-server-dom-webpack/server";\n';
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    if (name === 'default') {
      newSrc += 'export default ';
      newSrc += 'registerClientReference(function() {';
      newSrc +=
        'throw new Error(' +
        JSON.stringify(
          `1Attempted to call the default export of ${moduleId} from the server` +
          `but it's on the client. It's not possible to invoke a client function from ` +
          `the server, it can only be rendered as a Component or passed to props of a` +
          `Client Component.`,
        ) +
        ');';
    } else {
      newSrc += 'export const ' + name + ' = ';
      newSrc += 'registerClientReference(function() {';
      newSrc +=
        'throw new Error(' +
        JSON.stringify(
          `1Attempted to call ${name}() from the server but ${name} is on the client. ` +
          `It's not possible to invoke a client function from the server, it can ` +
          `only be rendered as a Component or passed to props of a Client Component.`,
        ) +
        ');';
    }
    newSrc += '},';
    newSrc += JSON.stringify(moduleId) + ',';
    newSrc += JSON.stringify(name) + ');\n';
  }
  return newSrc;
}


function addLocalExportedNames(names: Map<string, string>, node: any) {
  switch (node.type) {
    case 'Identifier':
      names.set(node.name, node.name);
      return;
    case 'ObjectPattern':
      for (let i = 0; i < node.properties.length; i++)
        addLocalExportedNames(names, node.properties[i]);
      return;
    case 'ArrayPattern':
      for (let i = 0; i < node.elements.length; i++) {
        const element = node.elements[i];
        if (element) addLocalExportedNames(names, element);
      }
      return;
    case 'Property':
      addLocalExportedNames(names, node.value);
      return;
    case 'AssignmentPattern':
      addLocalExportedNames(names, node.left);
      return;
    case 'RestElement':
      addLocalExportedNames(names, node.argument);
      return;
    case 'ParenthesizedExpression':
      addLocalExportedNames(names, node.expression);
      return;
  }
}

async function transformServerModule(loader: LoaderContext<{}>, source: string, body: AcornProgram, resourcePath: string) {
  // If the same local name is exported more than once, we only need one of the names.
  const localNames: Map<string, string> = new Map();
  const localTypes: Map<string, string> = new Map();

  for (let i = 0; i < body.length; i++) {
    const node = body[i];
    switch (node.type) {
      case 'ExportAllDeclaration':
        // If export * is used, the other file needs to explicitly opt into "use server" too.
        break;
      case 'ExportDefaultDeclaration':
        if (node.declaration.type === 'Identifier') {
          localNames.set(node.declaration.name, 'default');
        } else if (node.declaration.type === 'FunctionDeclaration') {
          if (node.declaration.id) {
            localNames.set(node.declaration.id.name, 'default');
            localTypes.set(node.declaration.id.name, 'function');
          } else {
            // TODO: This needs to be rewritten inline because it doesn't have a local name.
          }
        }
        continue;
      case 'ExportNamedDeclaration':
        if (node.declaration) {
          if (node.declaration.type === 'VariableDeclaration') {
            const declarations = node.declaration.declarations;
            for (let j = 0; j < declarations.length; j++) {
              addLocalExportedNames(localNames, declarations[j].id);
            }
          } else {
            const name = node.declaration.id.name;
            localNames.set(name, name);
            if (node.declaration.type === 'FunctionDeclaration') {
              localTypes.set(name, 'function');
            }
          }
        }
        if (node.specifiers) {
          const specifiers = node.specifiers;
          for (let j = 0; j < specifiers.length; j++) {
            const specifier = specifiers[j];
            if (specifier.local.type === 'Identifier' && specifier.exported.type === 'Identifier') {
              localNames.set(specifier.local.name, specifier.exported.name);
            }
          }
        }
        continue;
    }
  }
  if (localNames.size === 0) {
    return source;
  }

  const moduleId = url.pathToFileURL(resourcePath).href;

  let newSrc = source + '\n\n;';
  newSrc +=
    'import {registerServerReference} from "react-server-dom-webpack/server";\n';
  localNames.forEach(function (exported, local) {
    if (localTypes.get(local) !== 'function') {
      // We first check if the export is a function and if so annotate it.
      newSrc += 'if (typeof ' + local + ' === "function") ';
    }
    newSrc += 'registerServerReference(' + local + ',';
    newSrc += JSON.stringify(moduleId) + ',';
    newSrc += JSON.stringify(exported) + ');\n';
  });
  return newSrc;
}

async function transformModuleIfNeeded(loader: LoaderContext<{}>, source: string, resourcePath: string) {
  // Do a quick check for the exact string. If it doesn't exist, don't
  // bother parsing.
  if (
    source.indexOf('use client') === -1 &&
    source.indexOf('use server') === -1
  ) {
    return source;
  }

  let body;
  try {
    body = acorn.parse(source, {
      ecmaVersion: 2024,
      sourceType: 'module',
    }).body;
  } catch (x) {
    // eslint-disable-next-line react-internal/no-production-logging
    console.error('Error parsing %s %s', resourcePath, x instanceof Error ? x.message : String(x));
    return source;
  }

  let useClient = false;
  let useServer = false;
  for (let i = 0; i < body.length; i++) {
    const node = body[i];
    if (node.type !== 'ExpressionStatement' || !node.directive) {
      break;
    }
    if (node.directive === 'use client') {
      useClient = true;
    }
    if (node.directive === 'use server') {
      useServer = true;
    }
  }

  if (!useClient && !useServer) {
    return source;
  }

  if (useClient) {
    return await transformClientModule(loader, source, body, resourcePath);
  }

  return await transformServerModule(loader, source, body, resourcePath);
}

const loader: LoaderDefinition = function (source) {
  const next = this.async();
  transformModuleIfNeeded(this, source, this.resourcePath)
    .then((newSrc) => {
      next(null, newSrc);
    });
}

export = loader;
