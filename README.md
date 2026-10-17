# Manga Reader

App Android (APK) para buscar y leer manga, manhwa y webcomics.

- Buscador con portada y descripción de cada serie
- Lectura en cascada (scroll vertical continuo, ideal para manhwa y webtoons)
- Continuar donde lo dejaste, capítulos leídos, favoritos
- **MangaDex** incluida como fuente principal
- **Cualquier otra web**: pega el enlace de una serie o capítulo y la app detecta portada, descripción, capítulos y páginas. También puedes añadir una fuente con buscador propio.

## Obtener el APK

### Opción A: sin instalar nada (GitHub)

1. Crea un repositorio en GitHub y sube **todo el contenido de esta carpeta** (incluida `.github`).
2. Entra en la pestaña **Actions** → **Build APK** → **Run workflow**.
3. Al terminar (unos 5 minutos), abre la ejecución y descarga el archivo **manga-reader-apk**.
4. Descomprímelo, pasa `app-debug.apk` al teléfono e instálalo (Android pedirá permitir instalar apps de orígenes desconocidos).

### Opción B: en tu computadora

Necesitas Node 20+, JDK 21 y Android Studio (o el SDK de Android).

```bash
npm install
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
```

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`.
También puedes abrir el proyecto con `npx cap open android` y compilarlo desde Android Studio.

## Cómo usarla

**Explorar.** Elige la fuente, escribe un título y busca. Toca una serie para ver portada, descripción, etiquetas y capítulos.

**Pegar un enlace.** Pega en el buscador la URL de una serie (abre su detalle) o de un capítulo (abre el lector directamente). Funciona con la fuente "Cualquier web".

**Añadir una fuente con buscador.** En *Fuentes* → *Añadir fuente web*:

- Nombre y URL de búsqueda con `{q}` donde va el texto, por ejemplo `https://sitio.com/?s={q}`.
- Los selectores CSS son opcionales. Si los dejas vacíos, la app los detecta sola. Rellénalos solo si un sitio no se lee bien:
  - *Cada resultado*, *Título*, *Portada*: para la lista de búsqueda
  - *Descripción*: en la página de la serie
  - *Enlaces de capítulos*: en la página de la serie
  - *Imágenes del capítulo*: en la página del capítulo

**Lector.** Tocar la pantalla oculta o muestra las barras. En el botón `Aa`: separar páginas, ancho limitado para tablet y ahorro de datos.

## Límites conocidos

- Sitios que cargan sus capítulos solo con JavaScript, que usan Cloudflare/captcha o que paginan la lista de capítulos por AJAX pueden no leerse bien.
- Algunos sitios bloquean imágenes cuando se piden desde fuera de su página (hotlink).
- La app solo lee lo que cada sitio publica. Usa fuentes con contenido que tengas permiso de leer.

## Estructura

```
www/            la app (HTML, CSS, JS)
  parsers.js    detección automática de portadas, capítulos y páginas
  app.js        buscador, detalle, lector, biblioteca, fuentes
capacitor.config.json   empaquetado Android (HTTP nativo para saltar CORS)
.github/workflows/build-apk.yml   compila el APK en GitHub
```
