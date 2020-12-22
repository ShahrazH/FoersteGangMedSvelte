<!-- Dette er din forside  -->
<script>
    export let name;
    export let day;
    import Button from "./components/Button.svelte";
    import PropTest from "./components/PropTest.svelte";
    import Array from "./components/Array.svelte";
    import Click from "./components/Click.svelte";

    //Her henter definerer vi vores props som vi sætter ind i PropTest komponentet
    const props = {
        ord1: "dette",
        ord2: "er",
        ord3: "en",
        ord4: "prop",
        ord5: "test",
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
<h2>I dag er det den {day}</h2>
<PropTest
    dette={props.ord1}
    er={props.ord2}
    en={props.ord3}
    prop={props.ord4}
    test={props.ord5} />

<Button on:click={() => console.log('Nice click!')} />

<Array />

<Click />
