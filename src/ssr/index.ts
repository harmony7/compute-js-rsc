import ReactDOMServer from 'react-dom/server';
import ReactServerDOMClient from 'react-server-dom-webpack/client';

// * SSR *
// Renders the flight stream into HTML
export async function renderFlightStreamToHtmlStream(
  flightStream: ReadableStream<Uint8Array>,
  bootstrapScripts?: string[],
) {
  const { formState, root } = await ReactServerDOMClient.createFromReadableStream(flightStream);
  return await ReactDOMServer.renderToReadableStream(
    root,
    {
      bootstrapScripts,
      formState,
    }
  );
}
