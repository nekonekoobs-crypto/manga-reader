# Manga Reader

App Android (APK) para buscar y leer manga, manhwa y webcomics.

- Buscador con portada y descripción de cada serie
- Lectura en cascada (scroll vertical continuo, ideal para manhwa y webtoons)
- Continuar donde lo dejaste, capítulos leídos, favoritos
- **ManhwaWeb** (fuente por defecto) y **MangaDex** incluidas
- Fuentes preconfiguradas: **ZonaTMO**, **M440**, **LeerManhwas** y **TMOHentai (+18)**
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

**ManhwaWeb.** Usa la API del propio sitio (la web carga su contenido con JavaScript, por eso no basta leer su HTML). Sin texto en el buscador muestra las novedades; al escribir busca por título. Por defecto oculta lo +18: actívalo en *Fuentes → Ajustes*. Si pegas un enlace `manhwaweb.com/leer/...`, abre la serie directamente en ese capítulo. Cada capítulo muestra el grupo que lo subió. Las portadas y páginas se descargan con la red nativa de Android enviando el `Referer` de manhwaweb.com, porque su servidor de imágenes puede rechazar las peticiones que no vienen de su página; por eso ver las imágenes solo funciona dentro del APK, no en un navegador. Si algunas imágenes no cargan, abre *Fuentes* y pulsa **Probar carga de imágenes (diagnóstico)**: muestra el código HTTP y las cabeceras que devuelve el servidor en cuatro pruebas distintas.

**Fuentes preconfiguradas.** Se hicieron sin poder abrir los sitios reales desde el entorno de desarrollo, así que están probadas con respuestas simuladas, no con los sitios:

- *ZonaTMO*: la serie, la lista de capítulos y el lector se hicieron con HTML real del sitio (capítulos en `/view_uploads/{id}`, imágenes en `storage.zonatmo.org`). La búsqueda lee `/biblioteca?title=` y, si no puede, usa las sugerencias del buscador; esa parte no se comprobó con el sitio real.
- *M440*: búsqueda (`/search?q=`), serie, lista de capítulos y lector se hicieron con datos reales del sitio. La lista completa de capítulos viene cifrada (AES) dentro de la página y la app la descifra con la clave que usa el propio script del sitio; si el sitio cambia ese cifrado, la app muestra solo los capítulos con enlace visible. Puede pedir verificación de Cloudflare.
- *LeerManhwas*: sin texto muestra la portada del sitio; la búsqueda por texto es una suposición. Pegar enlaces funciona seguro.
- *TMOHentai (+18)*: listado, búsqueda, ficha de la obra y lector se hicieron con HTML/JSON reales del sitio. Cada obra es un solo capítulo (`/view_uploads/{id}`) con todas sus páginas (`storage.tmohentai.app/mangas/{id}/{n}.webp`). Oculta obras con títulos o etiquetas de menores, aunque es solo una protección parcial.
- Los enlaces pegados de estos sitios se reconocen solos (serie → detalle, capítulo → lector).

**Todas las fuentes.** En Explorar, la primera opción del selector busca el mismo título en todas las fuentes a la vez y muestra cada una cuando responde. Las que no contestan se listan al final. Las fuentes +18 se incluyen solo si activaste el contenido para adultos.

**Biblioteca.** Cada fila de *Continuar leyendo* y cada favorito tiene una ✕ para quitarlo de la lista (pide confirmación).

**Atrás.** El botón o gesto de atrás cierra la serie o el lector abiertos, o vuelve a Explorar desde Biblioteca y Fuentes; nunca cierra la app. El cuadro de búsqueda se vacía solo después de buscar.

**Pegar un enlace.** Pega en el buscador la URL de una serie (abre su detalle) o de un capítulo (abre el lector directamente). Funciona con cualquier web normal mediante la detección automática.

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
