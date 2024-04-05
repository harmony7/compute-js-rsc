import ReactDOMServer from 'react-dom/server.edge';
import ReactServerDOMClient from 'react-server-dom-webpack/client.edge';

// * SSR *
// Renders the flight stream into HTML
export async function renderFlightStreamToHtmlStream(
  flightStream: ReadableStream<Uint8Array>,
  bootstrapScripts?: string[],
) {
  const { formState, root } = await ReactServerDOMClient.createFromReadableStream(flightStream, {
    ssrManifest: {
      moduleMap: null,
      moduleLoading: null,
    }
  });
  return await ReactDOMServer.renderToReadableStream(
    root,
    {
      bootstrapScripts,
      formState,
    }
  );
}
