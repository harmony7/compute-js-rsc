import React from 'react';
import ReactServerDOMServer from 'react-server-dom-webpack/server.edge';

import {
  type ClientManifest,
  type ReactFormState,
  type ServerManifest,
} from '../types.js';
import { loadServerAction } from './utils.js';

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
// Performs an RSC action call from a form submission and returns the result.
export async function execRscFormAction(
  request: Request,
) {
  const formData = await request.formData();
  const action = await ReactServerDOMServer.decodeAction(formData, _moduleMaps.serverModuleMap);
  const result = await action();
  return ReactServerDOMServer.decodeFormState(result, formData);
}

// * SERVER *
// Performs an RSC action call and returns the result.
export async function execRscAction(
  rscAction: string,
  body: FormData | string,
): Promise<any> {
  if (_moduleMaps.serverModuleMap == null) {
    throw new Error('setModuleMaps must be called before execRscAction');
  }

  // Load the module and find the action based on the rscAction value
  const action = loadServerAction(rscAction, _moduleMaps.serverModuleMap);
  if (action == null) {
    throw new Error('Invalid action');
  }

  // Decode the args from the body
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
