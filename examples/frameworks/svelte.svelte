<!--
  Poke in Svelte / SvelteKit.

  Put this in src/routes/+layout.svelte so it wraps every page. Everything here
  runs in the browser only, which is what Poke needs.

  Env: VITE_POKE_URL = your backend URL. Drop the `adapter` line for localStorage.
-->
<script>
  import { page } from "$app/stores"; // SvelteKit; for plain Svelte, hardcode pageId

  let poke;
  let currentPage;

  // Runs on mount and on every navigation. Re-init so comments are scoped
  // to the current route.
  $: if (typeof window !== "undefined" && $page.url.pathname !== currentPage) {
    currentPage = $page.url.pathname;
    poke?.destroy();
    import("@appliftlabs/poke").then(({ init, HttpAdapter }) => {
      poke = init({
        // user: { id: data.user.id, name: data.user.name },
        pageId: currentPage,
        adapter: new HttpAdapter({ baseUrl: import.meta.env.VITE_POKE_URL }),
      });
    });
  }
</script>

<slot />
