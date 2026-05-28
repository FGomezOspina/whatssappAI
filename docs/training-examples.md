# Ejemplos de entrenamiento conversacional

La tabla `training_examples` no debe guardar chats completos de clientes. Guarda ejemplos curados: una situacion, el mensaje del cliente y la respuesta ideal.

## Que extraer de WhatsApp

- Casos donde el asesor humano respondio muy bien.
- Casos donde el bot pregunto de mas.
- Casos de nuevo pedido, repetir pedido, cambio de direccion, agregar/quitar productos.
- Casos donde el cliente manda varios mensajes cortos seguidos.
- Casos con imagen omitida, para que el agente pida el dato necesario sin inventar lo que habia en la imagen.

Antes de guardar ejemplos, elimina o cambia datos personales reales: cedulas, celulares, correos y direcciones exactas.

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
