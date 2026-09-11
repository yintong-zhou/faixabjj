// Password every account created from the Registro starts with. It is shown in
// the UI on purpose, so the maestro can pass it on — which is exactly why the
// account is flagged `must_change_password` at creation: a shared, published
// password is only tolerable for the few minutes before the member replaces
// it, and the app opens nothing else until they do.
export const DEFAULT_PASSWORD = "Nonaverepaura!";
