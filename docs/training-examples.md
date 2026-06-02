# Ejemplos de entrenamiento conversacional

La tabla `training_examples` no debe guardar chats completos de clientes. Guarda ejemplos curados: una situacion, el mensaje del cliente, la respuesta ideal y el criterio que debe conservar el agente.

Estos ejemplos se inyectan como contexto dinamico en el interprete y el humanizador. No son fine-tuning y no reemplazan la validacion del catalogo.

## Que extraer de WhatsApp

- Casos donde el asesor humano respondio muy bien.
- Casos donde el bot pregunto de mas.
- Casos de nuevo pedido, repetir pedido, cambio de direccion, agregar/quitar productos.
- Casos donde el cliente manda varios mensajes cortos seguidos.
- Casos donde el cliente consulta precios sin querer agregar productos.
- Casos donde el cliente envia varios productos en un solo mensaje.
- Casos con raza, abreviaturas o errores de escritura.
- Casos de imagen y audio, sin guardar archivos personales innecesarios.

Antes de guardar ejemplos, elimina o cambia datos personales reales: cedulas, celulares, correos y direcciones exactas.

No guardes API keys, comprobantes, audios, imagenes privadas ni conversaciones crudas en Supabase.

## Carpeta procesada

Los chats exportados se procesan con:

```bash
node scripts/generate-training-examples.js /Users/gomez/Downloads/Examples_chats data/training_examples
```

Ese comando genera:

- `data/training_examples/generated_training_examples.sql`: ejemplos listos para revisar y subir a Supabase.
- `data/training_examples/generated_training_examples.json`: la misma informacion en JSON.
- `data/training_examples/observed_terms.json`: terminos/productos vistos en chats que pueden servir para ampliar el catalogo.
- `data/training_examples/summary.json`: conteo de archivos, mensajes y ejemplos.

No subas chats crudos a Supabase. Usa solo los ejemplos anonimizados.

## Formato recomendado

`intent`: nombre corto de la situacion.

`customer_message`: mensaje o mini contexto. Ejemplo:

```text
Cliente ya tenia un pedido confirmado. Agente pregunta si desea repetirlo.
Cliente responde: para un dog chow a.rp 4kg
```

`ideal_response`: criterio de respuesta ideal. Ejemplo:

```text
Agregar Dog Chow Adulto Mini y Pequeno 4kg al pedido nuevo. No sumar el pedido anterior ni pedir presentacion otra vez. Luego confirmar si usa la misma direccion.
```

`notes`: regla breve para que la IA entienda el criterio.

`tags`: palabras clave como `nuevo pedido`, `direccion`, `no preguntar de mas`.

`priority`: entre 0 y 100. Usa 100 para reglas muy importantes.

## Criterios que conviene reforzar

- Preguntar precio no significa comprar.
- Una negativa por presentacion inexistente es una respuesta valida.
- Si el cliente envia dos productos, conservar cada item por separado.
- Si el cliente dice `asi esta bien`, avanzar sin repetir informacion ya resuelta.
- Una raza describe a la mascota; no es una marca desconocida.
- Si el cliente aclara `de 4kl`, completar la pregunta pendiente en vez de iniciar otra conversacion.
- Si una imagen no es legible, pedir solamente el dato faltante.
- Si un audio ya llega transcrito desde Kapso, razonar sobre la transcripcion como si fuera texto del cliente.

## Ejemplo SQL

```sql
insert into public.training_examples
  (intent, customer_message, ideal_response, notes, tags, priority)
values
  (
    'nuevo_pedido_producto_exacto',
    'Cliente quiere hacer otro pedido y responde: para un dog chow a.rp 4kg',
    'Agregar ese producto exacto al pedido nuevo y preguntar si se envia a la misma direccion. No pedir presentacion porque ya dijo 4kg.',
    'Cuando hay marca, referencia y presentacion exacta, avanzar sin preguntar de mas.',
    array['nuevo pedido', 'producto exacto', 'directo'],
    100
  );
```
