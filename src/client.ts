import React from 'react';
import ReactDOMClient from 'react-dom/client';
import ReactServerDOMClient from 'react-server-dom-webpack/client';

// * CLIENT *
// Client-side "Shell" component.
// Allows the use of "updateRoot" function to update the component tree.
let updateRoot: React.Dispatch<any>;
function Shell({data}: {data: any}) {
  const [root, setRoot] = React.useState(data);
  updateRoot = setRoot;
  return root;
}

// * CLIENT *
// This is the function that is called when a client component ('use client')
// calls an RSC action ('use server').
// Makes a function call to the server side. After receiving the flight stream
// response, decode the return value and updated React root from it.
// Use the React root to update the client UI, and then
// return the return value to the caller.
async function callServer(actionId: string, args: any) {
  const response = fetch('/', {
    method: 'POST',
    headers: {
      Accept: 'text/x-component',
      'rsc-action': actionId,
    },
    body: await ReactServerDOMClient.encodeReply(args),
  });

  const { returnValue, root } = await ReactServerDOMClient.createFromFetch(
    response,
    {
      callServer,
    }
  );

  React.startTransition(() => {
    updateRoot(root);
  });

  return returnValue;
}

// * CLIENT *
// Called when the application loads. Uses the flight stream data
// (either a copy injected into the HTML or from an additional fetch)
// and builds the React root and form state.
// Uses the React root and form state to hydrate the React application.
export async function hydrateApp() {
  const flightDataEl = document.getElementById('react-flight-data');

  let flightResponse;
  if (flightDataEl != null) {
    // If flight data already exists in the DOM, then we use it
    flightResponse = Promise.resolve(new Response(flightDataEl.textContent));
    flightDataEl.remove();
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
      callServer,
    }
  );

  const element = React.createElement(Shell, {data: root});
  ReactDOMClient.hydrateRoot(document, element, { formState, });
}
