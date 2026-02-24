<script lang="ts">
	import "../app.css";
	let { children } = $props();
</script>

<svelte:head><title>CPG Explorer</title></svelte:head>

<div class="layout">
	<nav class="nav">
		<a href="/" class="logo">CPG Explorer</a>
	</nav>
	<main class="main">{@render children()}</main>
</div>

<style>
	.layout {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
	}
	.nav {
		display: flex;
		align-items: center;
		padding: 0 16px;
		height: 44px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.logo {
		font-weight: 700;
		font-size: 14px;
		color: var(--text);
	}
	.main {
		flex: 1;
		overflow: hidden;
	}
</style>
