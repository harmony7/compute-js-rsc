import ReactDOMServer from "react-dom/server";
import ReactServerDOMClient from "react-server-dom-webpack/client";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const FLIGHT_SCRIPT_TAG_PREAMBLE = encoder.encode('<script id="react-flight-data" type="react/flight">');
const FLIGHT_SCRIPT_TAG_POSTAMBLE = encoder.encode('</script>');

// * SSR *
// Renders the flight stream into HTML, and also injects
// a string representation of the flight stream as a script tag
export async function renderFlightStreamToHtmlStream(
  flightStream: ReadableStream<Uint8Array>,
) {

  // TODO: When @fastly/js-compute implements ReadableStream.prototype.tee(),
  // we can use it to save buffering the entire flight stream to memory
  const flightStreamBuffer = await new Response(flightStream).arrayBuffer();
  flightStream = new Response(flightStreamBuffer).body!;

  const { formState, root } = await ReactServerDOMClient.createFromReadableStream(flightStream);
  const htmlStream: ReadableStream<Uint8Array> = await ReactDOMServer.renderToReadableStream(
    root,
    {
      bootstrapScripts: [
        '/app/runtime.js',
        '/app/main.js',
      ],
      formState,
    }
  );

  // Use a TransformStream to inject a script tag that contains the string representation of
  // the flight stream into the output HTML stream.
  let alreadyInjected = false;
  const flightStreamChunks: Uint8Array[] = [
    FLIGHT_SCRIPT_TAG_PREAMBLE,
    new Uint8Array(flightStreamBuffer),
    FLIGHT_SCRIPT_TAG_POSTAMBLE,
  ];

  const flightStreamInjectionTransform = new TransformStream<Uint8Array, Uint8Array>({
    async transform(
      chunk,
      controller,
    ) {
      if (alreadyInjected) {
        controller.enqueue(chunk);
        return;
      }
      // It's inserted right before the closing </body> tag in the HTML stream.
      const textChunk = decoder.decode(chunk);
      const closingBodyPos = textChunk.indexOf('</body>');
      if (closingBodyPos === -1) {
        controller.enqueue(chunk);
        return;
      }
      const chunks = [
        encoder.encode(textChunk.slice(0, closingBodyPos)),
        ...flightStreamChunks,
        encoder.encode(textChunk.slice(closingBodyPos)),
      ];
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      alreadyInjected = true;
    },
    flush(
      controller,
    ) {
      // If we've reached the end of the input stream and there hasn't been a closing
      // </body> tag for some reason, then insert it at the very end.
      if (alreadyInjected) {
        return;
      }
      for (const chunk of flightStreamChunks) {
        controller.enqueue(chunk);
      }
    },
  });

  return htmlStream.pipeThrough(flightStreamInjectionTransform);
}
