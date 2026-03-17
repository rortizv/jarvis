# Jarvis

Asistente de voz tipo Iron Man: se activa con la palabra **"Jarvis"** (o "Hola Jarvis"), escucha preguntas y responde por voz. Usa **Azure OpenAI** (LLM), **Wikipedia** para conceptos y **búsqueda web** (SearXNG) para hechos recientes o futuros.

- **Stack:** Angular 21, standalone, Tailwind, sin backend (todo en el cliente).
- **Voz:** Azure AI Speech (STT + TTS) con fallback a Web Speech API del navegador.
- **Datos:** Wikipedia (MediaWiki REST/API), búsqueda web (SearXNG).

---

## Stack y patrones

### Angular

- **Angular 21**, componentes **standalone** (sin NgModules).
- **`inject()`** en componentes y servicios (sin constructor para dependencias donde aplica).
- **`effect()`** en el componente Jarvis para reaccionar al toggle y arrancar/parar el micrófono.

### Signals

El estado reactivo se maneja con **signals** y **computed**:

| Dónde | Signal / computed | Uso |
|-------|-------------------|-----|
| **JarvisStore** | `isJarvisOn`, `isListening` | ON/OFF del asistente y si el micrófono está activo. |
| **JarvisStore** | `isMicActive` (computed) | `isJarvisOn() && isListening()`. |
| **VoiceService** | `isSpeaking` | True mientras Jarvis está hablando (TTS). |
| **VoiceService** | `listeningState` (readonly) | `'waitingForWakeWord'` o `'awaitingQuestion'`. |
| **VoiceService** | `isAwaitingQuestion` (computed) | True cuando se espera la pregunta (tras el saludo). |
| **ConversationService** | `isLoading` | True mientras se obtiene respuesta (Wikipedia, búsqueda, LLM). |
| **SpeechRecognitionService** | `isActive` | True cuando la sesión de reconocimiento está activa. |

La vista usa estos signals para mostrar "Escuchando...", "Hablando...", "Pensando...", "Di tu pregunta" / "Di «Jarvis»".

### Async / Promise

- **VoiceService:** `startListening()` y `stopListening()` son **async** y hacen `await` a `recognition.start()` / `recognition.stop()`.
- **SpeechRecognitionService:** `start()` y `stop()` devuelven **Promise** (en Azure se espera a que la sesión arranque o pare).
- **ConversationService:** `getResponse()` es async; usa `isLoading.set(true/false)` en try/finally.
- **Util `delay(ms)`** (`core/utils/async.util.ts`): pausas con `await delay(400)` en lugar de `setTimeout` con callbacks.

### Organización del código

- **Interfaces y tipos** en `core/models/index.ts` (Speech, conversación, LLM, MediaWiki, SearXNG); los servicios importan con `import type`.
- **Utils** en `core/utils/`: `text.util.ts` (normalización de texto), `async.util.ts` (`delay`).
- **HTTP:** una sola petición por flujo; se usa **Promise** (y `firstValueFrom` donde hace falta) en lugar de exponer Observables.

---

## Requisitos

- **Node.js:** `^20.19.0` LTS, `^22.12.0` o `^24.0.0` (compatible con Angular 21). Comprobar: `node -v`.
- **npm:** `>=10.x` (el proyecto usa `packageManager: "npm@10.9.4"`). Comprobar: `npm -v`.
- **Azure:** recurso *Speech* (Cognitive Services) y recurso *Azure OpenAI* con un deployment (ej. `gpt-4.1-mini`).
- **SearXNG (opcional):** para búsqueda web gratuita; requiere Docker para uso local.

---

## Arranque rápido

```bash
# Instalar dependencias
npm install

# Desarrollo (proxy para SearXNG incluido)
ng serve
```

Abre `http://localhost:4200`, activa el micrófono con el botón de Jarvis y di **"Jarvis"**. Luego haz tu pregunta.

Para que las preguntas de hechos recientes (ej. "¿quién ganó la última carrera de F1?") usen búsqueda web, levanta SearXNG antes:

```bash
docker compose up -d
ng serve
```

---

## Flujo de la aplicación

```
Usuario dice "Jarvis" o "Jarvis, ¿qué es React?"
        │
        ▼
┌─────────────────────┐
│ STT (Speech-to-Text)│  →  Azure Speech o Web Speech API
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│ Detección "Jarvis"   │  →  Si solo "Jarvis" → saludo y espera pregunta
│ + extracción pregunta│  Si "Jarvis + pregunta" → procesa directo
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│ Heurística          │  →  ¿Enciclopédica? → Wikipedia
│ (heuristic.ts)      │  →  ¿Pasado/futuro (resultados, fechas)? → Búsqueda web
└─────────────────────┘
        │
        ▼
┌─────────────────────┐     ┌─────────────────────┐
│ MediaWiki /         │     │ WebSearchService     │
│ WebSearchService    │     │ (SearXNG)             │
└─────────────────────┘     └─────────────────────┘
        │                              │
        └──────────────┬───────────────┘
                       ▼
┌─────────────────────┐
│ LlmService          │  →  Azure OpenAI (pregunta + contexto opcional)
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│ TTS (Text-to-Speech)│  →  Azure Speech o Web Speech API
└─────────────────────┘
        │
        ▼
Usuario escucha la respuesta. El historial se mantiene hasta apagar el micrófono.
```

---

## Estructura del proyecto

```
jarvis/
├── src/
│   ├── app/
│   │   ├── core/                          # Servicios principales
│   │   │   ├── models/                    # Interfaces (Speech, LLM, MediaWiki, SearXNG)
│   │   │   │   └── index.ts
│   │   │   ├── utils/
│   │   │   │   ├── text.util.ts           # normalizeText()
│   │   │   │   └── async.util.ts         # delay(ms)
│   │   │   ├── voice.service.ts           # Orquesta STT → pregunta → conversación → TTS (signals: isSpeaking, listeningState)
│   │   │   ├── conversation.service.ts   # Decide Wikipedia/web, llama LLM (signal: isLoading)
│   │   │   ├── speech-recognition.service.ts  # STT (signal: isActive)
│   │   │   ├── speech-synthesis.service.ts    # TTS: Azure o Web Speech API
│   │   │   ├── azure-speech-loader.ts     # Carga del SDK de Azure Speech por CDN
│   │   │   ├── llm.service.ts             # Cliente Azure OpenAI (chat)
│   │   │   ├── mediawiki.service.ts       # Búsqueda + extracto Wikipedia
│   │   │   ├── web-search.service.ts     # Búsqueda web: SearXNG
│   │   │   └── heuristic.ts               # needsWikipedia(), needsRecentInfo(), getSearchQuery()
│   │   ├── features/jarvis/
│   │   │   ├── jarvis.component.ts        # UI + toggle micrófono, enlace con VoiceService
│   │   │   ├── jarvis.store.ts            # Estado (isJarvisOn, isListening) con signals
│   │   │   ├── jarvis.component.html
│   │   │   └── jarvis.component.css
│   │   ├── app.ts                         # Raíz: importa solo JarvisComponent
│   │   ├── app.config.ts
│   │   └── app.routes.ts
│   ├── environments/
│   │   ├── environment.ts                 # Producción
│   │   └── environment.development.ts     # Desarrollo (fileReplacements en ng serve)
│   ├── types/
│   │   └── speech-recognition.d.ts        # Tipos Web Speech API
│   ├── main.ts
│   └── styles.css
├── searxng/
│   └── config/
│       └── settings.yml                   # formats: [html, json] para API
├── proxy.conf.json                       # /api/searxng → localhost:8080
├── docker-compose.yml                    # Servicio SearXNG
└── angular.json                          # proxyConfig para ng serve
```

---

## Configuración (environment)

Angular **no** lee `.env` en runtime; la configuración va en los archivos `environment*.ts`. En desarrollo se usa `environment.development.ts` por `fileReplacements` en `angular.json`.

| Variable | Dónde | Descripción |
|----------|--------|-------------|
| `azure.endpoint` | environment | Endpoint de Cognitive Services (opcional para Speech; se usa key + region). |
| `azure.apiKey` | environment | API key del recurso **Speech** (Cognitive Services). |
| `azure.region` | environment | Región del recurso Speech (ej. `eastus`). |
| `azure.speechVoiceName` | environment | Voz de Azure TTS. Ej: `es-CO-GonzaloNeural`, `es-ES-AlvaroNeural`, `es-MX-JorgeNeural`. |
| `azureOpenAI.endpoint` | environment | URL del recurso Azure OpenAI (sin barra final). |
| `azureOpenAI.apiKey` | environment | API key de Azure OpenAI. |
| `azureOpenAI.deployment` | environment | Nombre del deployment (ej. `gpt-4.1-mini`). |
| `wikipediaLang` | environment | Código de idioma para Wikipedia (ej. `es`). |
| `searxngBaseUrl` | environment | Base URL de SearXNG. En dev: `'/api/searxng'` (proxy). En prod: URL pública si aplica. |

**Ejemplo** `environment.development.ts`:

```ts
export const environment = {
  production: false,
  azure: {
    endpoint: 'https://...',
    apiKey: '...',
    region: 'eastus',
    speechVoiceName: 'es-CO-GonzaloNeural',
  },
  azureOpenAI: {
    endpoint: 'https://...',
    apiKey: '...',
    deployment: 'gpt-4.1-mini',
  },
  wikipediaLang: 'es',
  searxngBaseUrl: '/api/searxng',
};
```

---

## Voz (TTS y STT)

- **Si** `azure.apiKey` y `azure.region` están definidos, se usa **Azure Speech** para STT y TTS.
- **Si** Azure falla al cargar (red, CORS, etc.) o no está configurado, **Web Speech API** del navegador hace de fallback (STT y TTS).

Para comprobar en consola (F12): si aparece *"Azure TTS no disponible, usando Web Speech"*, la voz es la del navegador.

**Cambiar la voz de Jarvis (Azure):** edita `azure.speechVoiceName` en el environment. Voces masculinas tipo asistente:

- `es-CO-GonzaloNeural` (Colombia)
- `es-ES-AlvaroNeural` (España)
- `es-MX-JorgeNeural` (México)

---

## Wikipedia (conceptos)

Para preguntas enciclopédicas ("qué es X", "quién fue Y", "información sobre Z") se usa la **API de MediaWiki**:

- Búsqueda: `GET https://{wikipediaLang}.wikipedia.org/w/rest.php/v1/search/page?q=...`
- Extracto: `GET https://{wikipediaLang}.wikipedia.org/w/api.php?action=query&prop=extracts&...`

La heurística (`needsWikipedia()` en `heuristic.ts`) decide si se llama a Wikipedia según patrones (qué es, quién es, busca, hablame de, etc.).

---

## Búsqueda web (hechos recientes o futuros)

Para preguntas sobre pasado (última carrera, quién ganó, cuándo fue) o futuro (próximo GP, cuándo es, fecha, horario) se usa **búsqueda web**. La heurística `needsRecentInfo()` en `heuristic.ts` activa la búsqueda (patrones: último, anterior, pasado, próximo, siguiente, cuando fue, cuando es, etc.).

La búsqueda web usa **SearXNG** (si `searxngBaseUrl` está configurado en el environment).

### SearXNG (gratis, open source)

1. **Requisito:** Docker (o Docker Compose).
2. **Levantar:** en la raíz del proyecto:
   ```bash
   docker compose up -d
   ```
   SearXNG queda en `http://localhost:8080` con JSON habilitado en `searxng/config/settings.yml`.
3. **App:** `ng serve` usa `proxy.conf.json` y reenvía `/api/searxng` → `http://localhost:8080`. En environment: `searxngBaseUrl: '/api/searxng'`.
4. **Comprobar:**
   ```bash
   curl "http://localhost:8080/search?q=formula+1&format=json"
   ```
   Debe devolver JSON con un array `results`.
5. **Parar:** `docker compose down`.

Para producción, despliega el mismo Compose y en `environment` pon la URL pública en `searxngBaseUrl`.

### Si la búsqueda falla

Si `needsRecentInfo` es true pero la búsqueda no devuelve resultados (SearXNG caído, error de red), en consola verás un aviso y el LLM recibirá un mensaje para indicar que no tiene información actualizada (no inventa fechas ni nombres).

---

## Comandos

| Comando | Descripción |
|--------|-------------|
| `npm install` | Instalar dependencias |
| `ng serve` | Servidor de desarrollo (proxy activo) |
| `ng build` | Build de producción en `dist/` |
| `ng test` | Tests unitarios (Vitest) |

---

## Criterios de aceptación (resumen)

- Al decir "Jarvis" se recibe el saludo y se puede hacer una pregunta seguida.
- Preguntas enciclopédicas usan Wikipedia cuando la heurística lo indica.
- Preguntas de hechos recientes o futuros usan búsqueda web (SearXNG) cuando la heurística lo indica.
- El LLM (Azure OpenAI) responde con contexto de Wikipedia o búsqueda cuando existe; si la búsqueda falla, no inventa datos.
- La voz es configurable vía `azure.speechVoiceName`; sin Azure se usa Web Speech del navegador.
- El historial de conversación se limpia al apagar el micrófono.

---

## Referencias

- [Angular CLI](https://angular.dev/tools/cli)
- [Azure AI Speech](https://learn.microsoft.com/azure/ai-services/speech-service/)
- [Azure OpenAI](https://learn.microsoft.com/azure/ai-services/openai/)
- [MediaWiki REST API](https://www.mediawiki.org/wiki/API:REST_API/Reference)
- [SearXNG](https://docs.searxng.org/)
