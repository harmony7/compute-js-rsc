import React from 'react';
import ReactDOMClient from 'react-dom/client';
import ReactServerDOMClient from 'react-server-dom-webpack/client';

// * CLIENT *
// Called on the client (browser) when the application loads. Uses the
// flight response and builds the React root and form state.
// Uses the React root and form state to hydrate the React application.
export async function hydrateApp(flightStream?: ReadableStream<Uint8Array>) {

  let flightResponse: Promise<Response>;
  if (flightStream != null) {
    flightResponse = Promise.resolve(new Response(flightStream));
  } else {
    // Fetch flight data from backend
    flightResponse = fetch('/', {
      headers: {
        Accept: 'text/x-component',
      },
    });
  }

  const { root, formState } = await ReactServerDOMClient.createFromFetch(
    flightResponse,
    {
      callServer, // Defined below
    }
  );

  const updateRoot: React.Dispatch<any> = ReactDOMClient.hydrateRoot(document, root, { formState, });

  // This is the function that is called when a client component ('use client')
  // calls an RSC action ('use server').
  // Makes a function call to the server side. After receiving the flight stream
  // response, decodes the return value and the updated React root from it.
  // Uses the React root to update the client UI, and then
  // returns the return value to the caller of the RSC action.
  async function callServer(actionId: string, args: any) {
    const flightResponse = fetch('/', {
      method: 'POST',
      headers: {
        Accept: 'text/x-component',
        'rsc-action': actionId,
      },
      body: await ReactServerDOMClient.encodeReply(args),
    });

    const { returnValue, root } = await ReactServerDOMClient.createFromFetch(
      flightResponse,
      {
        callServer,
      }
    );

    React.startTransition(() => {
      updateRoot(root);
    });

    return returnValue;
  }
}
