<script>
	import { onMount } from "svelte";
	import welcome from "./screens/welcome.svelte";
	import Game from "./screens/Game.svelte";
	import { select } from "./select.js";
	import { load_image } from "./utils";

	let celebs_promise;

	let state = "welcome"; // or "playing";

	let selection;

	const start = async (e) => {
		const { celebs, lookup } = await celebs_promise;

		selection = select(celebs, lookup, e.detail.category.slug);
		state = "playing";
	};

	const load_celebs = async () => {
		const res = await fetch(
			"https://cameo-explorer.netlify.app/celebs.json"
		);
		const data = await res.json();

		const lookup = new Map();

		data.forEach((c) => {
			lookup.set(c.id, c);
		});

		const subset = new Set();
		data.forEach((c) => {
			if (c.reviews >= 50) subset.add(c);
			c.similar.forEach((id) => {
				subset.add(lookup.get(id));
			});
		});

		return {
			celebs: Array.from(subset),
			lookup,
		};

		console.log(data);
	};

	// let animals_promise;
	// const load_animals = async () => {
	// 	const res = await fetch("/animals.json");
	// 	const data = await res.json();

	// 	console.log(data);
	// };

	onMount(() => {
		celebs_promise = load_celebs();
		load_image("/icons/right.svg");
		load_image("/icons/wrong.svg");
		// animals_promise = load_animals();
	});
</script>

<style>
	main {
		text-align: center;
		padding: 1em;
		max-width: 800px;
		margin: 0 auto;
		height: 97%;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
</style>

<main>
	{#if state === 'welcome'}
		<Welcome on:select={start} />
	{:else if state === 'playing'}
		<Game {selection} on:restart={() => (state = 'welcome')} />
	{/if}
</main>
