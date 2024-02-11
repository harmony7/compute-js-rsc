// react/shared/ReactTypes.js
// TODO: Eventually get this from type of formData on Options passed to
// ReactServerDOMServer.renderToReadableStream

// This is an opaque type returned by decodeFormState on the server, but it's
// defined in this shared file because the same type is used by React on
// the client.
export type ReactFormState<S, ReferenceId> = [
  S /* actual state value */,
  string /* key path */,
  ReferenceId /* Server Reference ID */,
  number /* number of bound arguments */,
];

// react-server-dom-webpack/src/shared/ReactFlightImportMetadata.js

export type ImportManifestEntry = {
  id: string,
  // chunks is a double indexed array of chunkId / chunkFilename pairs
  chunks: Array<string>,
  name: string,
};

export type ClientReferenceManifestEntry = ImportManifestEntry;

// TODO: Eventually get this from typeof renderToReadableStream.renderToReadableStream

export type ClientManifest = {
  [id: string]: ClientReferenceManifestEntry,
};

// TODO: Eventually get this from typeof ReactServerDOMServer.decodeReply

export type ServerManifest = {
  [id: string]: ImportManifestEntry,
};
