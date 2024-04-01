import React from 'react';
import ReactServerDOMServer from 'react-server-dom-webpack/server';

import {
  type ClientManifest,
  type ReactFormState,
  type ServerManifest,
} from "../types";

declare function __webpack_require__(moduleId: string): any;

export type ModuleMaps = {
  clientModuleMap?: ClientManifest;
  serverModuleMap?: ServerManifest;
};

const _moduleMaps: ModuleMaps = {};
// * SERVER *
// Sets the client and server module manifests
export function setModuleMaps(moduleMaps: ModuleMaps) {
  _moduleMaps.clientModuleMap = moduleMaps.clientModuleMap;
  _moduleMaps.serverModuleMap = moduleMaps.serverModuleMap;
}

// * SERVER *
// Takes the passed-in return value and form state, and generates a flight stream.
export function generateFlightStream(
  rootElement: React.ReactElement,
  returnValue: any,
  formState: null | ReactFormState<any, any> = null,
): ReadableStream<Uint8Array> {
  if (_moduleMaps.clientModuleMap == null) {
    throw new Error('setModuleMaps must be called before generateFlightStream');
  }

  const payload = {
    root: rootElement,
    returnValue,
    formState,
  };
  return ReactServerDOMServer.renderToReadableStream(payload, _moduleMaps.clientModuleMap);
}

// * SERVER *
// Performs an RSC action call and returns the result.
export async function execRscAction(
  rscAction: string,
  body: any,
): Promise<any> {
  if (_moduleMaps.serverModuleMap == null) {
    throw new Error('setModuleMaps must be called before execRscAction');
  }

  // Find the module and action based on the rscAction value
  const [url, name] = rscAction.split('#');
  const moduleId = _moduleMaps.serverModuleMap[url]?.id;
  if (moduleId == null) {
    throw new Error('Module not found');
  }

  const module = __webpack_require__(moduleId);
  const action = module[name];

  // Validate that this is actually a function we intended to expose and
  // not the client trying to invoke an arbitrary function.
  if (action.$$typeof !== Symbol.for('react.server.reference')) {
    throw new Error('Invalid action');
  }

  // Decode the args from the body.
  const args = await ReactServerDOMServer.decodeReply(body, _moduleMaps.serverModuleMap);

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
