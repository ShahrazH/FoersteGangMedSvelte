import App from '../src/App.svelte';

new App({
    target: document.body,
    props: {
        name: 'world',
        day: "today"
    }
});