<script>
    let ord = [
        { ord: "Kage" },
        { ord: "Goldenrod" },
        { ord: "Random" },
        { ord: "HMTL" },
        { ord: "HEJ" },
    ];
</script>

<h2>Liste af Random ord fra et array. Listen bliver generet for hvert ord</h2>

{#each ord as ord}
    <ul>
        <li>{ord.ord}</li>
    </ul>
{/each}
