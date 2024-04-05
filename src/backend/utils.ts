import { type ServerManifest } from '../types.js';

declare function __webpack_require__(moduleId: string): any;

const SERVER_REFERENCE_TAG = Symbol.for('react.server.reference');

function isServerReference(reference: Object): boolean {
  return '$$typeof' in reference && reference.$$typeof === SERVER_REFERENCE_TAG;
}

// It feels like something like this should be made public in some way
// from ReactServerDOMServer
export function loadServerAction(id: string, serverManifest: ServerManifest) {
  const [url, name] = id.split('#');
  const moduleId = serverManifest[url]?.id;
  if (moduleId == null) {
    return null;
  }

  const module = __webpack_require__(moduleId);
  if (module == null) {
    return null;
  }

  const action = module[name];
  if (!isServerReference(action)) {
    return null;
  }

  return action;
}
