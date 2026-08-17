# Bot Pintando Murales — Agente de WhatsApp

Agente que conversa por WhatsApp con clientes potenciales de **Pintando Murales**, responde
dudas sobre los servicios, va recopilando los datos del proyecto y **cualifica el lead**
automaticamente. Cuando un lead queda cualificado (o el cliente pide hablar con una persona),
avisa al equipo humano para que tome el relevo.

Usa la [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api) de Meta
para enviar/recibir mensajes y [Claude](https://docs.claude.com/) (Anthropic) como motor de
conversacion, con "tools" para registrar los datos del lead de forma estructurada mientras
charla de forma natural.

## Como funciona

1. Meta reenvia cada mensaje entrante al endpoint `POST /webhook`.
2. El agente (`src/agent.ts`) carga el historial de esa conversacion y el estado del lead,
   y llama a Claude con tres herramientas:
   - `update_lead_info`: guarda los datos que el cliente va compartiendo (ciudad, tipo de
     mural, tamaño, plazo, presupuesto...).
   - `qualify_lead`: marca el lead como cualificado o no en cuanto hay datos suficientes.
   - `request_human_handoff`: avisa al equipo humano (log y/o webhook) y cede la conversacion.
3. La respuesta de Claude se envia de vuelta al cliente por WhatsApp.
4. Todo se persiste en `data/conversations.json` (fichero local, pensado para una sola
   instancia; ver "Limitaciones" mas abajo).

## Configuracion del negocio

Todos los criterios de cualificacion, tono, servicios y zonas se editan en
[`business.config.json`](./business.config.json) **sin tocar el codigo**:

- `serviceAreas`: ciudades/zonas donde trabajais (edita el placeholder).
- `qualification.requiredFields`: datos que debe tener un lead para considerarse cualificado.
- `qualification.minBudgetEUR`: presupuesto minimo orientativo.
- `handoff.notifyMethod`: `"log"` (solo consola) o `"webhook"` para reenviar el lead cualificado
  a una URL externa.
- `handoff.webhookUrl`: si usas `"webhook"`, puedes apuntar aqui al **Custom Webhook** de vuestro
  escenario de Make *"Integration Google Ads Web Form, Google Sheets"* para reutilizar el mismo
  pipeline que ya teneis (Google Sheets + HubSpot), en vez de montar uno nuevo.
- `greeting`: mensaje con el que el bot se presenta si vosotros iniciais la conversacion.

## Requisitos previos

- Cuenta de [Meta for Developers](https://developers.facebook.com/) con una app configurada
  con el producto **WhatsApp** (Cloud API), un numero de telefono de prueba o verificado, y un
  token de acceso (idealmente permanente, de un System User).
- Una API key de Anthropic (`ANTHROPIC_API_KEY`).
- Node.js 18+.

## Instalacion local

```bash
npm install
cp .env.example .env
# Edita .env con tus credenciales (ver WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, etc.)
npm run dev
```

El servidor arranca en `http://localhost:3000`. Para que Meta pueda llamar a tu webhook en
local, expon el puerto con [ngrok](https://ngrok.com/) (u otro tunel):

```bash
ngrok http 3000
```

## Configurar el webhook en Meta

En tu app de Meta for Developers, WhatsApp > Configuration:

1. **Callback URL**: `https://<tu-dominio-o-ngrok>/webhook`
2. **Verify token**: el mismo valor que pusiste en `WHATSAPP_VERIFY_TOKEN` en `.env`
3. Suscribete al campo `messages`.
4. Guarda el **Phone Number ID** y el **token de acceso** en `.env` (`WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_TOKEN`). Para produccion, genera un token permanente de System User (los tokens
   temporales de prueba caducan en 24h).
5. (Recomendado) Copia el **App Secret** de la app en `WHATSAPP_APP_SECRET` para que el bot
   verifique la firma de cada webhook.

## Despliegue

Incluye un `Dockerfile` listo para desplegar en cualquier plataforma que acepte contenedores
(Render, Railway, Fly.io, un VPS con Docker...):

```bash
docker build -t bot-pintando-murales .
docker run -p 3000:3000 --env-file .env bot-pintando-murales
```

Recuerda montar `/app/data` como volumen persistente si quieres conservar el historial de
conversaciones entre despliegues.

## Probar sin esperar un mensaje real

Puedes forzar el envio del saludo inicial a un numero desde un script de Node usando
`sendGreeting` (`src/agent.ts`), o simplemente escribir al numero de WhatsApp de pruebas desde
tu propio movil una vez el webhook este verificado: el bot respondera automaticamente.

## Limitaciones y siguientes pasos sugeridos

- El almacenamiento (`data/conversations.json`) es un fichero JSON local: valido para
  arrancar y para una sola instancia. Para producir a mas volumen, sustituye `src/store.ts`
  por Postgres/Redis manteniendo la misma interfaz (`getOrCreate`, `save`, `all`).
- Solo se procesan mensajes de texto; los tipos `image`, `audio`, `location`, etc. se
  registran en el log pero no se responden (facil de ampliar en `src/server.ts` /
  `extractIncomingMessage`).
- La notificacion al equipo humano es un `console.log` + webhook opcional. Si quereis un
  aviso por email/Slack/Telegram, se puede añadir facilmente en `src/leads.ts`.
- No hay ventana de re-apertura de conversacion (WhatsApp exige plantillas aprobadas para
  escribir primero a un usuario fuera de la ventana de 24h); este bot esta pensado para
  responder a clientes que escriben primero.
