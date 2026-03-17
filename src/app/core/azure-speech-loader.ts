/**
 * Carga el Azure Speech SDK desde CDN (evita bundlar dependencias Node).
 * El bundle expone el SDK en window (nombre según versión del script).
 */

const SCRIPT_URL =
  'https://cdn.jsdelivr.net/npm/microsoft-cognitiveservices-speech-sdk@1.48.0/distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle.min.js';

declare global {
  interface Window {
    SpeechSDK?: unknown;
  }
}

let loadPromise: Promise<unknown> | null = null;

export function loadAzureSpeechSdk(): Promise<unknown> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if ((window as unknown as { SpeechSDK?: unknown }).SpeechSDK) {
    return Promise.resolve((window as unknown as { SpeechSDK: unknown }).SpeechSDK);
  }
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      const sdk = (window as unknown as { SpeechSDK?: unknown }).SpeechSDK
        ?? (window as unknown as { Microsoft?: { CognitiveServices?: { Speech?: unknown } } }).Microsoft?.CognitiveServices?.Speech;
      if (sdk) resolve(sdk);
      else reject(new Error('Azure Speech SDK no expuesto en window'));
    };
    script.onerror = () => reject(new Error('Error cargando Azure Speech SDK'));
    document.head.appendChild(script);
  });
  return loadPromise;
}
