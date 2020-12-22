import App from '../src/App.svelte';
let d = new Date()
let n = d.getDay()

new App({
    target: document.body,
    props: {
        name: 'world',
        day: n + "." + " dag i ugen"
    }
});