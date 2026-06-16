# Kapso: Numero, Webhook y Produccion

Este documento es la guia operativa para conectar WhatsApp por Kapso. Sirve tanto para sandbox como para un numero dedicado/comercial. La arquitectura interna esta en `docs/project-context.md`.

El backend recibe eventos en:

```text
POST /webhooks/kapso/whatsapp
```

Y expone health check en:

```text
GET /health
```

## Regla Basica

Para que un numero funcione deben coincidir cuatro piezas:

1. `KAPSO_PHONE_NUMBER_ID` en `.env`.
2. Una fila activa en Supabase `client_channels` con ese `phone_number_id`.
3. Un webhook activo en Kapso para ese mismo numero.
4. `KAPSO_WEBHOOK_SECRET` igual en `.env` y en Kapso.

Cambiar solo `KAPSO_PHONE_NUMBER_ID` permite enviar por ese numero, pero no basta para recibir ni para resolver el cliente AIVANCE.

## Configuracion De `.env`

Variables Kapso:

```env
KAPSO_API_KEY=...
KAPSO_PHONE_NUMBER_ID=...
KAPSO_WEBHOOK_SECRET=...
KAPSO_API_BASE_URL=https://api.kapso.ai/meta/whatsapp/v24.0
META_GRAPH_VERSION=v24.0
```

Para un numero dedicado en produccion:

```env
NODE_ENV=production
```

Para pruebas locales con sandbox puedes usar:

```env
NODE_ENV=development
KAPSO_SANDBOX_CLIENT_SLUG=distrifinca
```

Ese fallback solo existe para desarrollo. En produccion el canal debe existir en Supabase.

## Asociar El Numero A Distrifinca

Ejecuta en Supabase, cambiando `TU_PHONE_NUMBER_ID_DE_KAPSO` por el id real del numero:

```sql
insert into public.client_channels
  (client_id, provider, channel, phone_number_id, display_name, active)
select
  id,
  'kapso',
  'whatsapp',
  'TU_PHONE_NUMBER_ID_DE_KAPSO',
  'WhatsApp Distrifinca',
  true
from public.aivance_clients
where slug = 'distrifinca'
on conflict (client_id, provider, channel, phone_number_id)
do update set
  display_name = excluded.display_name,
  active = true,
  updated_at = now();
```

Verifica:

```sql
select
  ac.slug,
  cc.provider,
  cc.channel,
  cc.phone_number_id,
  cc.display_name,
  cc.active
from public.client_channels cc
join public.aivance_clients ac on ac.id = cc.client_id
where cc.provider = 'kapso'
  and cc.channel = 'whatsapp'
  and cc.phone_number_id = 'TU_PHONE_NUMBER_ID_DE_KAPSO';
```

Debe devolver `slug = distrifinca` y `active = true`.

## Exponer El Backend

Local:

```bash
npm start
```

En otra terminal:

```bash
ngrok http 3000
```

La URL publica queda similar a:

```text
https://abc123.ngrok-free.app
```

La URL completa del webhook sera:

```text
https://abc123.ngrok-free.app/webhooks/kapso/whatsapp
```

En produccion usa el dominio HTTPS estable del backend.

## Crear El Webhook En Kapso

En el numero de WhatsApp dentro de Kapso, abre **Manage Webhooks** y crea un webhook:

```text
URL: https://TU_DOMINIO/webhooks/kapso/whatsapp
Kind: kapso
Payload: v2
Secret: mismo valor de KAPSO_WEBHOOK_SECRET
Active: true
```

Selecciona solamente:

```text
Message received
```

No selecciones para el flujo conversacional inicial:

- `Message sent`
- `Message delivered`
- `Message read`
- `Conversation started`
- `Conversation inactive`
- `Conversation ended`
- `Message failed`

Los eventos de entrega y falla sirven para observabilidad futura, pero el bot actual solo necesita mensajes entrantes.

Si Kapso ofrece buffering para `Message received`, usa una ventana corta, por ejemplo 2 segundos. El backend tambien tiene su propio buffer con `INBOUND_MESSAGE_BUFFER_MS`.

## Crear Webhook Por API

Alternativa por API:

```bash
curl --request POST \
  --url "https://api.kapso.ai/platform/v1/whatsapp/phone_numbers/TU_PHONE_NUMBER_ID/webhooks" \
  --header "Content-Type: application/json" \
  --header "X-API-Key: TU_KAPSO_API_KEY" \
  --data '{
    "whatsapp_webhook": {
      "kind": "kapso",
      "url": "https://TU_DOMINIO/webhooks/kapso/whatsapp",
      "events": ["whatsapp.message.received"],
      "secret_key": "TU_KAPSO_WEBHOOK_SECRET",
      "payload_version": "v2",
      "buffer_enabled": true,
      "buffer_window_seconds": 2,
      "max_buffer_size": 10
    }
  }'
```

## Verificacion

Comprueba el backend:

```bash
curl https://TU_DOMINIO/health
```

Respuesta esperada:

```json
{ "ok": true, "provider": "kapso" }
```

Ejecuta pruebas:

```bash
npm test
```

Luego envia un WhatsApp al numero configurado. En logs debe aparecer:

```text
[Kapso] Mensaje recibido
```

Y despues:

```text
[Kapso] Respuesta enviada
```

## Banco De Pruebas

Prueba desde un celular autorizado o desde el numero real:

```text
Hola, necesito hacer un pedido
```

```text
Cuanto vale Dog Chow adulto raza pequena de 4 kilos?
```

```text
Solo estaba preguntando. Y el Dog Chow adulto grande de 1 kilo?
```

```text
Necesito un domicilio con Dog Chow a.r.p 1kl y Dog Chow adulto grande 2kl
```

```text
Necesito un Dog Chow razas pequenas de 8 kilos
```

Tambien verifica:

- Imagen con marca, linea, especie y peso visibles.
- Imagen sin texto.
- Nota de voz.
- Dos mensajes enviados rapidamente.
- Reenvio del mismo payload para idempotencia.
- Seleccion posterior de una opcion mostrada.

## Multimedia

- Imagen: el backend busca URL real en campos equivalentes de Kapso, descarga el archivo y lo envia a OpenAI como data URL/base64.
- Audio/nota de voz: el backend descarga el archivo si hay URL y lo envia al modelo de transcripcion configurado.
- Si no hay URL descargable, `message.kapso.transcript.text` puede usarse como respaldo.
- Los logs no imprimen base64 ni tokens de descarga.

## Solucion De Problemas

### Kapso muestra `0 configured`

No hay webhook creado para ese numero. Entra a **Manage Webhooks** y registra la URL del backend con `Message received`.

### `401 Invalid signature`

- Confirma que `KAPSO_WEBHOOK_SECRET` en `.env` coincide exactamente con el secreto configurado en Kapso.
- Reinicia el servidor despues de cambiar `.env`.
- Verifica que Kapso este enviando el webhook en formato `kapso` y payload `v2`.

### Llega el webhook pero no responde

- Confirma `KAPSO_API_KEY`.
- Confirma `KAPSO_PHONE_NUMBER_ID`.
- Revisa que `client_channels` tenga ese `phone_number_id` asociado a Distrifinca.
- Revisa logs de OpenAI, Supabase y Kapso.

### El cliente no se resuelve

El error esperado es similar a:

```text
No hay cliente activo asociado al canal de WhatsApp phone_number_id=...
```

Solucion: registrar o activar la fila correspondiente en `client_channels`.

### Kapso no alcanza el backend

- Comprueba `GET /health`.
- Verifica que ngrok o el dominio HTTPS esten activos.
- Actualiza la URL del webhook si el dominio cambio.

## Paso A Operacion Comercial

Antes de usar el numero con clientes reales:

1. Usa `NODE_ENV=production`.
2. Exige `KAPSO_WEBHOOK_SECRET`.
3. Verifica `client_channels` para el numero real.
4. Deja activo solo `Message received`.
5. Ejecuta `npm test`.
6. Prueba texto, imagen, audio, cotizacion, carrito y confirmacion.
7. Revisa `docs/known-issues-and-roadmap.md`.

## Referencias

- [Kapso webhooks](https://docs.kapso.ai/docs/platform/webhooks)
- [Kapso event types](https://docs.kapso.ai/docs/platform/webhooks/event-types)
- [Kapso send text messages](https://docs.kapso.ai/docs/whatsapp/send-messages/text)
- [OpenAI vision](https://platform.openai.com/docs/guides/images-vision)
- [OpenAI speech to text](https://platform.openai.com/docs/guides/speech-to-text)
