/**
 * Node-Aufloesungshaken fuer die gebauten `pkg/`-Artefakte.
 *
 * `@baustatik/mesh-2d-wasm` wird mit ENDUNGSLOSEN relativen Importen gebaut
 * (`./heap-diagnostics`), wie es CODING_STANDARDS.md vorschreibt. Ein Bundler
 * loest das auf, das blanke Node nicht. Dieses Messgeraet laeuft ohne Bundler,
 * also haengt es den Haken selbst ein: schlaegt ein relativer Import fehl,
 * wird `.js` angehaengt und erneut versucht.
 */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (specifier.startsWith('.') && !/\.[cm]?js$/.test(specifier)) {
      return await next(`${specifier}.js`, context);
    }
    throw error;
  }
}
