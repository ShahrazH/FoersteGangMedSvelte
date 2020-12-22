<!-- Dette er din forside  -->
<script>
    export let name;
    export let day;
    import Button from "./Button.svelte";
    import TestComponent from "./TestComponent.svelte";

    const test = {
        ord1: "dette",
        ord2: "er",
        ord3: "en",
        ord4: "test",
    };
</script>

<style>
    :global(body) {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        font-family: "Franklin Gothic Medium";
    }
</style>

<h1>Hello {name}!</h1>
<h2>The day is {day}</h2>
<TestComponent
    dette={test.ord1}
    er={test.ord2}
    en={test.ord3}
    test={test.ord4} />

<Button />
