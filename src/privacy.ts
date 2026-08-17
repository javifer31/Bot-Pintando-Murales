import { loadBusinessConfig } from "./config";

/**
 * Politica de privacidad servida en /privacy. Meta exige una URL publica de
 * politica de privacidad para poder publicar la aplicacion.
 *
 * IMPORTANTE: este texto describe de forma honesta lo que el bot hace realmente,
 * pero no es asesoramiento legal. Revisalo (y adaptalo con un profesional si el
 * proyecto crece) antes de tratarlo como documento definitivo, sobre todo en lo
 * relativo al RGPD y a los datos de contacto del responsable del tratamiento.
 */
export function renderPrivacyPolicy(): string {
  const { companyName } = loadBusinessConfig();
  const updated = "18 de agosto de 2026";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Política de privacidad — ${companyName}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    line-height: 1.6;
    max-width: 46rem;
    margin: 0 auto;
    padding: 2.5rem 1.25rem 4rem;
    color: #1a1a1a;
    background: #fff;
  }
  @media (prefers-color-scheme: dark) {
    body { color: #e8e8e8; background: #16181c; }
    a { color: #7cb3ff; }
  }
  h1 { font-size: 1.75rem; margin-bottom: .25rem; }
  h2 { font-size: 1.15rem; margin-top: 2rem; }
  .updated { color: #6b7280; font-size: .9rem; margin-top: 0; }
  ul { padding-left: 1.25rem; }
</style>
</head>
<body>
  <h1>Política de privacidad</h1>
  <p class="updated">${companyName} — última actualización: ${updated}</p>

  <p>
    Esta política explica qué datos recogemos cuando escribes por WhatsApp al
    asistente virtual de ${companyName}, para qué los usamos y qué derechos tienes
    sobre ellos.
  </p>

  <h2>Qué datos recogemos</h2>
  <p>Cuando inicias una conversación con nuestro asistente por WhatsApp, tratamos:</p>
  <ul>
    <li>Tu número de teléfono de WhatsApp.</li>
    <li>El contenido de los mensajes que nos envías y de nuestras respuestas.</li>
    <li>
      Los datos de tu proyecto que compartas durante la conversación: nombre,
      localidad, tipo de mural, superficie aproximada, plazos y presupuesto orientativo.
    </li>
  </ul>
  <p>No recogemos datos de tu dispositivo, ubicación exacta ni tu agenda de contactos.</p>

  <h2>Para qué los usamos</h2>
  <ul>
    <li>Responder a tus preguntas sobre nuestros servicios de murales.</li>
    <li>Entender tu proyecto para poder preparar un presupuesto adecuado.</li>
    <li>Poner en contacto contigo a una persona de nuestro equipo.</li>
  </ul>
  <p>No usamos tus datos para publicidad ni los vendemos a terceros.</p>

  <h2>Con quién los compartimos</h2>
  <p>Para que el asistente funcione, tus mensajes pasan por estos servicios:</p>
  <ul>
    <li>
      <strong>WhatsApp (Meta)</strong>: es el canal por el que se transmiten los mensajes.
    </li>
    <li>
      <strong>OpenRouter</strong> y el proveedor de modelo de lenguaje que enruta:
      procesan el texto de la conversación para generar las respuestas.
    </li>
    <li>
      <strong>Nuestro proveedor de alojamiento</strong>: donde se ejecuta el asistente
      y se guarda el historial de la conversación.
    </li>
  </ul>
  <p>
    Además, cuando la conversación deriva en una solicitud de presupuesto, esos datos
    pasan a las herramientas internas de gestión de clientes de ${companyName} para que
    nuestro equipo pueda atenderte.
  </p>

  <h2>Cuánto tiempo los conservamos</h2>
  <p>
    Conservamos el historial de la conversación y los datos del proyecto mientras sean
    necesarios para atender tu solicitud y, en su caso, durante la relación comercial.
    Puedes pedirnos que los eliminemos en cualquier momento.
  </p>

  <h2>Tus derechos</h2>
  <p>
    Puedes solicitar acceder a tus datos, rectificarlos, eliminarlos, limitar su
    tratamiento u oponerte a él. Para ejercer cualquiera de estos derechos, o si tienes
    dudas sobre esta política, escríbenos por el mismo WhatsApp o a través de los datos
    de contacto publicados en nuestra web.
  </p>

  <h2>Cambios en esta política</h2>
  <p>
    Si modificamos esta política, actualizaremos la fecha que aparece al principio de
    esta página.
  </p>
</body>
</html>`;
}
