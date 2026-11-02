# IWSDK project guidance

@AGENTS.md

# Contexto del producto: Boardroom (frontend + backend)

Este repo (`demo1`) es el **frontal inmersivo** de **Boardroom**: una reunión de dirección por voz con
agentes-directores de IA, pensada para **Meta VR Glasses** (mirada + pellizco). El **backend es otro repo**:

| Parte | Ruta local | Qué es |
| --- | --- | --- |
| Frontend (este repo) | `/Users/javier/Desktop/Personal/metaglasses/demo1` | App WebXR con IWSDK, solo cliente |
| Backend | `/Users/javier/Desktop/Personal/viteapps-projects/gestionRequisitos/gestion-requisitos/viteapps-projects/BOARDROOM-001` | Monorepo Next.js con la API `/api/v1`. Tiene su propio `CLAUDE.md`: léelo antes de tocarlo |

Si un cambio afecta al contrato de la API (rutas, eventos SSE, tipos), hay que actualizar **los dos lados**.
Los tipos del cliente en `src/api.ts` (`TurnEvent`, `WhiteboardItem`, ...) son espejo de `lib/turn.ts` y
`lib/whiteboard.ts` del backend.

## Frontend (este repo)

- **Stack:** TypeScript 5.5, Vite 7, Node ≥20.19. Sin framework de UI web: DOM mínimo (`src/ui.ts`) más UI espacial.
- **XR:** IWSDK `@iwsdk/core` 1.1.0-rc.2 (ECS), modo VR, `handTracking` y `gazeTracking` activos. Emulador por defecto: `metaVRGlasses`.
- **3D:** Three.js vía `super-three` 0.185 (se importa desde `@iwsdk/core`, nunca de `three`). Personas con modelos Rocketbox en `public/models/Business_*`.
- **UI espacial:** `@pmndrs/uikit` + `uikit-horizon` + `uikit-lucide`, maquetada en UIKitML (`public/ui/board-bar.uikitml`, `tablet.uikitml`). La fuente no tiene acentos/caracteres especiales: el texto del panel 3D se pasa a ASCII (`ascii()` en `meeting-system.ts`).
- **Exportación de pizarra:** `pptxgenjs` (PPTX), CSV y descarga del documento original (`whiteboard-export.ts`).
- **Sin tests.** Verificación: `npm run typecheck`, y las herramientas MCP `iwsdk-runtime` (ver reglas de IWSDK arriba).

### Mapa de `src/`

| Archivo | Responsabilidad |
| --- | --- |
| `index.ts` | `World.create()`, registra `MeetingSystem`, monta la UI DOM y oculta el DOM en sesión XR |
| `api.ts` | Cliente de `/api/v1` (fetch + Bearer + SSE del chat). `BASE_URL` = `VITE_BOARDROOM_URL` > `localStorage['boardroom.url']` > `http://localhost:3000` |
| `boardroom.ts` | Estado de sesión/empresa/reunión y orquestación del turno (login, reuniones, chat, voz) |
| `bridge.ts` | Objeto compartido red/voz → escena 3D. `MeetingSystem` lo lee cada frame; los módulos de red lo escriben |
| `meeting-system.ts` | Sistema ECS principal: asientos, quién habla, tablet y panel XR |
| `room.ts`, `props.ts`, `person.ts`, `avatar.ts` | Sala de juntas procedural, mobiliario y personajes animados (6 perfiles, máx. 5 directores sentados) |
| `voice.ts`, `speech-chunks.ts` | Entrada (Web Speech API, o `getUserMedia` + `/voice/transcribe`) y salida (`/voice/speak`, o `speechSynthesis`) |
| `ui.ts` | Interfaz DOM fuera de XR: login, empresa, reuniones, transcripción, texto y 🎤 |
| `board-ui.ts`, `tablet-ui.ts`, `dock.ts` | Paneles 3D: barra de la pizarra, tablet de la interfaz XR y su anclaje |
| `whiteboard.ts`, `whiteboard-draw.ts`, `whiteboard-export.ts` | Pizarra: estado, dibujo en canvas (pared + tablet) y exportación |
| `components.ts`, `assets.ts`, `util.ts` | Manifiestos IWSDK y utilidades |

### Flujo en XR (Meta VR Glasses)

- No hay teclado: abrir `https://<host>:8443/#token=<token>&url=<https://servidor>`. El token sale de `POST /api/v1/auth/login` y se guarda en `localStorage['boardroom.token']` (`adoptTokenFromUrl()`).
- La página 2D ofrece dos entradas (`mountXrButtons()` en `index.ts`, con `offer: none` y `mode: ar` en `iwsdk.config.json`): **Enter VR** (sala completa) y **Mixed reality** (opcional: `Room.office` se oculta y queda mesa, sillas, personas, pizarra, tablet y cuaderno sobre el entorno real).
- El panel 3D tiene **Hablar** (mirada + pellizco) y **Nueva reunion**, con estado y subtítulos.
- WebXR/IWSDK no tiene API de dictado en las gafas; por eso se usan APIs web estándar.
- El dev server corre en `https://localhost:8443` (certificado local; se acepta el aviso).

### Comandos

```sh
npm run dev          # iwsdk dev restart --open --foreground (servidor + navegador gestionado)
npm run typecheck    # tsc --noEmit  (hacerlo siempre antes de probar)
npm run build        # vite build
npx @iwsdk/cli dev status
```

## Backend (repo `BOARDROOM-001`)

- **Qué es:** plataforma multiusuario donde un CEO crea empresas y monta un comité de **agentes-directores** (cargos) con los que mantiene "reuniones" (chat multiagente).
- **Stack:** monorepo pnpm + Turborepo; app Next.js 16 (App Router, Turbopack) en `apps/app`, puerto 3000; React 19, Tailwind 4, TypeScript 5.9, Zod 4, Biome. Despliegue en Vercel.
- **Datos:** Neon (PostgreSQL serverless) con Prisma 7 (adaptador HTTP: **sin `$transaction`**, nada de `createMany`; usar SQL crudo con `ON CONFLICT DO NOTHING`). **pgvector** (`vector(1536)`) para embeddings. Sin RLS: el aislamiento es de aplicación, todo acceso pasa por `lib/access.ts` (`getCompany/getAgent/getMeeting` filtran por `ownerId` salvo ADMIN).
- **IA:** AI SDK 7 (`ai`) vía Vercel AI Gateway. `MAIN_MODEL` = `anthropic/claude-sonnet-5.5`, `FAST_MODEL` = `anthropic/claude-haiku-5.5` (`lib/agents.ts`). Cada director es un `ToolLoopAgent`; tools: `searchDocuments`, `consultColleague`, `webSearch`, `calculator`, `currentDate`, y `whiteboard`.
- **Voz:** TTS `openai/tts-1` (voces por `Agent.voice`: `female-1..3`, `male-1..3`), STT `openai/gpt-4o-mini-transcribe` en español (audio ≤4 MB).
- **Documentos:** original en Vercel Blob privado, texto en BD (PDF con `unpdf`) y fragmentos con embeddings; RAG por turno.
- **Modelo de datos:** `AdminUser`, `CeoUser`, `Company` (`maxAgents`), `Agent`, `CompanyDocument`, `DocumentChunk`, `Meeting` (`summary`), `MeetingAgent`, `Message`, `Setting`.
- **Reglas de reunión:** solo hablan los directores de `MeetingAgent`; se les llama por nombre ("Javier, dime...") y, sin mención, un moderador (haiku) elige quién responde (`lib/addressing.ts`, `lib/turn.ts`). El nombre de pila es único por empresa (409 si se repite).
- **Comandos (en el backend):** `./scripts/ejecucion/dev.sh app` (:3000, runtime node), `pnpm --filter app typecheck`, `pnpm --filter @repo/database build` tras tocar `schema.prisma`. Para IA local: `vercel env pull .env.local` (el `VERCEL_OIDC_TOKEN` caduca en ~12 h).

## Contrato de la API `/api/v1`

Auth por `Authorization: Bearer <token>` (el login lo devuelve, 7 días; el backend también acepta cookie). CORS abierto. Errores: `{ error: string }`.

| Endpoint | Uso en el frontend |
| --- | --- |
| `POST auth/login` · `GET me` | Sesión |
| `GET catalog` · `GET companies` · `GET companies/:id` | Cargos, empresas, directores y reuniones |
| `POST companies/:id/agents` `{positionKey}` · `POST companies/:id/meetings` | Crear director / reunión |
| `GET/PATCH/DELETE meetings/:id` · `PUT meetings/:id/participants` `{agentIds}` | Reunión y directores presentes |
| `POST meetings/:id/chat` `{message}` | Respuesta **SSE**: eventos `user, speaker, delta, message, whiteboard, notice, error, end` |
| `GET documents/:id/download` | Descargar el original desde la pizarra |
| `POST voice/speak` `{text, voice}` · `POST voice/transcribe` (multipart `audio`) | TTS (audio/mpeg) y STT (`{text}`) |

La **pizarra** (`whiteboard`) no se persiste en BD: el backend emite `whiteboard {item}` con `document | chart | web | slides | notes` y el cliente lo dibuja, lo pagina y permite exportarlo.

## Convenciones del proyecto

- Textos de UI y contenido de agentes/voz en **inglés** (UI DOM y 3D, tutorial, pizarra, frases de espera). Los comentarios y commits pueden seguir en español (los identificadores, en inglés o español según el archivo vecino).
- Voz: reconocimiento y síntesis en **`en-US`** (`voice.ts`); las órdenes de voz de la pizarra (`board-commands.ts`) son frases cortas en **inglés** ("zoom in", "next", "close the whiteboard"...).
- Los commits llevan el estilo del historial (frase corta descriptiva en español).
- Estado en el worktree: el trabajo de pizarra/tablet (`whiteboard*.ts`, `board-ui.ts`, `tablet-ui.ts`, `dock.ts`, `speech-chunks.ts`) puede estar sin commitear; revisar `git status` antes de asumir.
