import React from "react";
import ReactDOMServer from "react-dom/server";
import ReactServerDOMClient from "react-server-dom-webpack/client";

// * SSR *
// "Shell" component used during SSR
// The 'use' hook works with ReactDOMServer.renderToReadableStream,
// waiting for the promise to resolve to the React root
function Shell({root}: {root: Promise<any>}): any {
  // TODO: This "as any" will no longer be needed when React exposes the definition
  return (React as any).use(root);
}

// * SSR *
// Renders the flight stream into HTML
export async function renderFlightStreamToHtmlStream(
  flightStream: ReadableStream<Uint8Array>
) {

  // This hack is borrowed from React's flight fixture, where they
  // create a temporary formState object before parsing the flight stream,
  // and then fill it in along the parsing.
  // They say it is a hack, so we hope React will clean this up

  // the "lazy" formState
  const formState: any[] = [];
  async function parseFlightStream() {
    const { root, formState: flightFormState } = await ReactServerDOMClient.createFromReadableStream(flightStream);
    // We shouldn't be assuming formState is an object type but at the moment
    // we have no way of setting the form state from within the render
    Object.assign(formState, flightFormState);

    return root;
  }

  const root = parseFlightStream();

  // noinspection JSCheckFunctionSignatures
  const model = React.createElement(Shell, { root });

  // The "await" on the next line will actually cause the React.use in the Shell to await the promise
  // Therefore, by the time the rendering actually happens, any useFormState() or useFormStatus() in
  // the children will have the updated value.

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
  const [ flightStream1, flightStream2 ] = await new Promise<[ReadableStream<Uint8Array>, ReadableStream<Uint8Array>]>(async resolve => {
    const content = await new Response(flightStream).text();
    resolve([
      new Response(content).body!,
      new Response(content).body!,
    ]);
  });

  // Render the flight stream to HTML (purpose A)
  const renderStream = await renderFlightStreamToHtmlStream(flightStream1);

  // Inject the flight stream data into the HTML stream as a script tag (purpose B)
  return injectFlightStreamIntoRenderStream(renderStream, flightStream2);

}
