import React from 'react';
import ReactServerDOMServer from 'react-server-dom-webpack/server';

import { ClientManifest, ReactFormState, ServerManifest } from "./types.js";

declare function __webpack_require__(moduleId: string): any;

// * SERVER *
// Reexport React.createElement
export { createElement as createReactElement } from 'react';

// * SERVER *
// Takes the passed-in return value and form state, and generates a flight stream.
export function generateFlightStream(
  rootElement: React.ReactElement,
  returnValue: any,
  formState: null | ReactFormState<any, any>,
  clientModuleMap: ClientManifest,
): ReadableStream<Uint8Array> {
  const payload = {
    root: rootElement,
    returnValue,
    formState,
  };

  return ReactServerDOMServer.renderToReadableStream(payload, clientModuleMap);
}

// * SERVER *
// Performs an RSC action call and returns the result.
export async function execRscAction(
  rscAction: string,
  request: Request,
  serverModuleMap: ServerManifest,
): Promise<any> {

  // Find the module and action based on the rscAction value
  const [url, name] = rscAction.split('#');
  const moduleId = serverModuleMap[url]?.id;
  if (moduleId == null) {
    throw new Error('Module not found');
  }

  // noinspection JSUnresolvedReference
  const module = __webpack_require__(moduleId);
  const action = module[name];

  // Validate that this is actually a function we intended to expose and
  // not the client trying to invoke arbitrary functions.
  if (action.$$typeof !== Symbol.for('react.server.reference')) {
    throw new Error('Invalid action');
  }

  // Decode the args from the request body.
  let body;
  const contentType = request.headers.get('Content-Type') ?? 'text/plain; charset=UTF-8';
  if (contentType.startsWith('multipart/form-data;')) {
    body = await request.formData();
  } else {
    body = await request.text();
  }
  const args = await ReactServerDOMServer.decodeReply(body, serverModuleMap);

  // Make the function call
  const result = action.apply(null, args);

  try {
    // Wait for any mutations
    await result;
  } catch (x) {
    // We handle the error on the client
  }

  return result;
}
