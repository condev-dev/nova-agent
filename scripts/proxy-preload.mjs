import { ProxyAgent, setGlobalDispatcher } from "undici";

const proxyUrl =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy;

if (proxyUrl) {
  try {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
    if (process.env.PROXY_PRELOAD_DEBUG) {
      console.error(`[proxy-preload] undici global dispatcher -> ${proxyUrl}`);
    }
  } catch (err) {
    console.error(`[proxy-preload] failed to install ProxyAgent for ${proxyUrl}:`, err);
  }
}
