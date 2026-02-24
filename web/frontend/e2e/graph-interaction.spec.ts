import { test, expect } from "@playwright/test";

/**
 * CPG Explorer e2e tests.
 *
 * Requires:
 *   1. `npm run build` in web/frontend (already embedded)
 *   2. Go server running: `cd web && go run . -db ../cpg.db -port 8080`
 *
 * Run: npx playwright test
 */

test.describe("CPG Explorer", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/");
        // Wait for the graph to load (loading state disappears)
        await page.waitForSelector(".graph-area", { timeout: 10_000 });
        // Wait for sigma canvas to render
        await page.waitForSelector(".graph-area canvas", { timeout: 10_000 });
    });

    test("page loads with overview breadcrumb and stats", async ({ page }) => {
        // Breadcrumb shows "Packages" as current
        const bc = page.locator(".bc-current");
        await expect(bc).toHaveText("Packages");

        // Stats pills are visible
        const pills = page.locator(".stats-pills .pill");
        await expect(pills).toHaveCount(4);
    });

    test("right sidebar shows empty hint initially", async ({ page }) => {
        const sidebar = page.locator(".right-sidebar");
        await expect(sidebar).toBeVisible();

        const emptyHint = sidebar.locator(".sb-empty");
        await expect(emptyHint).toBeVisible();
        await expect(emptyHint).toContainText("Hover or click");
    });

    test("sidebar does not have go-deep button without selection", async ({
        page,
    }) => {
        const goDeep = page.locator(".go-deep-btn");
        await expect(goDeep).toHaveCount(0);
    });

    test("clicking a graph node does NOT change URL", async ({ page }) => {
        const urlBefore = page.url();

        // Click on the sigma canvas (approximate center — hits a node in the graph)
        const canvas = page.locator(".graph-area canvas").first();
        const box = await canvas.boundingBox();
        if (box) {
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }

        // Wait a tick for any navigation
        await page.waitForTimeout(500);

        // URL should NOT have changed (no auto-drill)
        expect(page.url()).toBe(urlBefore);
    });

    test("module filter buttons are visible on overview", async ({ page }) => {
        const filterBar = page.locator(".module-filter");
        await expect(filterBar).toBeVisible();

        // "All" button should exist
        const allBtn = filterBar.locator(".mod-pill", { hasText: "All" });
        await expect(allBtn).toBeVisible();
    });

    test("sidebar has correct structure and width", async ({ page }) => {
        const sidebar = page.locator(".right-sidebar");
        const box = await sidebar.boundingBox();
        expect(box).toBeTruthy();
        // Should be 320px wide (or close, accounting for padding/border)
        expect(box!.width).toBeGreaterThanOrEqual(300);
        expect(box!.width).toBeLessThanOrEqual(340);
    });

    test("graph canvas renders sigma WebGL canvas", async ({ page }) => {
        const canvases = page.locator(".graph-area canvas");
        // Sigma renders multiple canvases (nodes, edges, labels, etc.)
        const count = await canvases.count();
        expect(count).toBeGreaterThanOrEqual(1);
    });

    test("back button returns to overview after package navigation", async ({
        page,
    }) => {
        // Navigate to a package via URL
        const pkg = await page.evaluate(async () => {
            const resp = await fetch("/api/packages");
            const data = await resp.json();
            return data.length > 0 ? data[0].package : null;
        });

        if (!pkg) {
            test.skip();
            return;
        }

        await page.goto(`/?pkg=${encodeURIComponent(pkg)}`);

        // Wait for the canvas to render at the package level
        await page.waitForSelector(".graph-area canvas", { timeout: 10_000 });
        // Give Svelte time to reactively update breadcrumbs
        await page.waitForTimeout(1000);

        // Verify we're at the package level by checking URL
        expect(page.url()).toContain("pkg=");

        // Go back
        await page.goBack();
        await page.waitForTimeout(1000);

        // Should be back at overview — URL has no params
        expect(new URL(page.url()).searchParams.has("pkg")).toBe(false);

        // Breadcrumb should show "Packages" as current
        const bc = page.locator(".bc-current");
        await expect(bc).toHaveText("Packages");
    });
});
