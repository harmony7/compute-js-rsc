import React, { type ReactElement } from "react";
import ReactDOMServer from "react-dom/server";
import ReactServerDOMClient from "react-server-dom-webpack/client";

// TODO: This declaration will no longer be needed when React exposes the definition
declare module "React" {
  function use<T>(obj: Promise<T>): T;
}

type FlightContent = { root: ReactElement };

// * SSR *
// "Shell" component used during SSR
// The 'use' hook works with ReactDOMServer.renderToReadableStream,
// waiting for the promise to resolve to the React root
function Shell(props: {flightContentPromise: Promise<FlightContent>}): any {
  return React.use(props.flightContentPromise).root;
}

// * SSR *
// Renders the flight stream into HTML
export async function renderFlightStreamToHtmlStream(
  flightStream: ReadableStream<Uint8Array>
) {
  // This procedure is borrowed form React's flight fixture.

  // We need to get the formState before we start rendering, but we also
  // need to run the Flight client inside the render to get all the preloads.
  // The API is ambivalent about what's the right one, so we need two for now.

  // Tee the response into two streams so that we can do both.
  // TODO: use .tee() when Compute runtime supports it
  // const [ rscResponse1, rscResponse2 ] = flightStream.tee();
  const [ rscResponse1, rscResponse2 ] = await teeReadableStream(flightStream);

  const { formState } = await ReactServerDOMClient.createFromReadableStream(rscResponse1);

  // This is equivalent to the following JSX, but we're not using JSX in this file:
  // <Shell flightContentPromise={/* createFromReadableStream */} />
  const model = React.createElement(Shell, {
    flightContentPromise: ReactServerDOMClient.createFromReadableStream(rscResponse2),
  });

  // Render it into HTML by resolving the client components
  return await ReactDOMServer.renderToReadableStream(
    model,
    {
      bootstrapScripts: [
        '/app/runtime.js',
        '/app/main.js',
      ],
      formState,
    }
  );
}

// * SSR *
// A utility "transform stream" that is used to inject a copy of the flight stream into
// the HTML stream as a script tag.
class FlightStreamInjectionTransform extends TransformStream<Uint8Array, Uint8Array> {
  static decoder = new TextDecoder();
  static encoder = new TextEncoder();
  constructor(flightStream: ReadableStream<Uint8Array>) {
    let alreadyInjected = false;

    const transformer = {
      async transform(
        chunk: Uint8Array,
        controller: TransformStreamDefaultController<Uint8Array>,
      ) {
        if (!((chunk as unknown) instanceof Uint8Array)) {
          // Guard anyway in case someone uses this TransformStream with an unexpected stream type
          throw new Error('Received non-Uint8Array chunk');
        }
        if (alreadyInjected) {
          controller.enqueue(chunk);
          return;
        }

        const textChunk = FlightStreamInjectionTransform.decoder.decode(chunk);
        const closingHeadPos = textChunk.indexOf('</head>');
        if (closingHeadPos === -1) {
          controller.enqueue(chunk);
          return;
        }

        function enqueueString(stringChunk: string) {
          controller.enqueue(FlightStreamInjectionTransform.encoder.encode(stringChunk));
        }
        enqueueString(
          textChunk.slice(0, closingHeadPos)
        );
        enqueueString(
          `<script id="react-flight-data" type="react/flight">`
        );

        // TODO: Use an async iterator when Compute runtime gets support
        // for await (const value of flightStream)
        const reader = flightStream.getReader();
        while(true) {
          const {done, value} = await reader.read();
          if (done) {
            break;
          }
          controller.enqueue(value);
        }

        enqueueString(
          `</script>`
        );
        enqueueString(
          textChunk.slice(closingHeadPos)
        );
        alreadyInjected = true;
      },
    };
    super(transformer);
  }
}

// * SSR *
// Inject the flight stream into the HTML stream as a script tag.
export function injectFlightStreamIntoRenderStream(
  renderStream: ReadableStream<Uint8Array>,
  flightStream: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  return renderStream.pipeThrough(new FlightStreamInjectionTransform(flightStream));
}

// * SSR *
// A combined utility version that renders the flight stream to HTML and
// then also injects the flight stream into the HTML stream as a script tag.
export async function renderFlightStreamToHtmlStreamWithFlightData(
  flightStream: ReadableStream<Uint8Array>,
) {

  // The flight stream is needed twice:
  // - Once now to render HTML (purpose A)
  // - Later in the client during app hydration (purpose B)

  // After rendering the HTML (purpose A), we will inject a copy of the flight
  // stream into the HTML body so that the client side code can use it
  // for hydration (purpose B). If we didn't do this, then the client side code would have
  // to make an additional fetch to perform hydration.

  // Because a ReadableStream can only be streamed from once, we tee it.
  // TODO: use .tee() when Compute runtime supports it
  // const [ flightStream1, flightStream2 ] = flightStream.tee();
  const [ flightStream1, flightStream2 ] = await teeReadableStream(flightStream);

  // Render the flight stream to HTML (purpose A)
  const renderStream = await renderFlightStreamToHtmlStream(flightStream1);

  // Inject the flight stream data into the HTML stream as a script tag (purpose B)
  return injectFlightStreamIntoRenderStream(renderStream, flightStream2);

}

async function teeReadableStream(stream: ReadableStream<Uint8Array>) {
  return new Promise<[ReadableStream<Uint8Array>, ReadableStream<Uint8Array>]>(async resolve => {
    const content = await new Response(stream).arrayBuffer();
    resolve([
      new Response(content).body!,
      new Response(content).body!,
    ]);
  });
}
