<script>
    let count = 0;

    function click() {
        count += 1;
    }
</script>

<style>
    button {
        outline: none;
        margin-bottom: 2em;
    }
</style>

{#if count === 20}
    <p>Ja, det var så de {count} klik, godt gået? tror jeg..</p>
{:else if count === 10}
    <p>
        Du har klikket
        {count}
        gange nu. Der er lidt vej til de 20. Du kan tage en pause eller
        forstætte, det er op til dig.
    </p>
{:else}
    <p>Du er på {count} click - Kan du nå op på 20?</p>
{/if}

<button on:click={click}>
    Du har klikket
    {count}
    {count === 1 ? 'gang' : 'gange'}
</button>
