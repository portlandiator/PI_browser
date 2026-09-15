export async function loadCompressed(url) {
  const response=await fetch(url);
  if(!response.ok)throw new Error(`Could not load ${url} (${response.status}).`);
  if(!globalThis.DecompressionStream)throw new Error('This reader needs a current browser with gzip support. Please update your browser.');
  const stream=response.body.pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}
