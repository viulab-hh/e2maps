<script>
  import { onMount } from "svelte";
  import { cubicInOut } from "svelte/easing";
  import { tweened } from "svelte/motion";
  import { dsvFormat, geoMercator, geoPath } from "d3";

  const WIDTH = 800;
  const HEIGHT = 1000;
  const DISPLAY_HEIGHT = 700;
  const CELL_SIZE = 70;
  const GRID_TOP = 90;
  const LABEL_SIZE = 20;
  const LABEL_PADDING_LEFT = 4;
  const cellPadding = CELL_SIZE * 0.06;

  const layout = [
    [1, "SW", 0, 3], [2, "GK", 1, 3], [3, "HO", 0, 5], [4, "SD", 1, 4],
    [5, "GT", 1, 5], [6, "BG", 2, 5], [7, "HL", 2, 3], [8, "WS", 2, 4],
    [9, "OW", 3, 3], [10, "M1", 3, 4], [11, "M2", 4, 4], [12, "M3", 4, 5],
    [13, "M4", 3, 5], [14, "HS", 4, 2], [15, "BB", 4, 1], [16, "WR", 5, 0],
    [17, "QB", 5, 1], [18, "AL", 5, 2], [19, "SF", 5, 3], [20, "SB", 5, 4],
    [21, "BU", 5, 5], [22, "KT", 6, 5], [23, "ZB", 4, 6], [24, "WB", 5, 8],
    [25, "JS", 6, 6], [26, "DR", 5, 6], [27, "DRW", 5, 7], [28, "BW", 6, 4],
    [29, "SK", 8, 3], [30, "EL", 6, 3], [31, "SH", 6, 2], [32, "QF", 7, 3],
    [33, "MB", 8, 5], [34, "BDS", 8, 6], [35, "H1", 7, 4], [36, "H2", 7, 5],
    [37, "H3", 7, 6], [38, "H4", 7, 7], [39, "WF", 9, 5], [40, "NB", 8, 4],
    [41, "ZT", 9, 6]
  ].map(([nr, id, row, col]) => ({ nr, id, row, col }));

  const parties = [
    { key: "AfD", label: "AfD", field: "F02.AfD", color: "#0c82bf" },
    { key: "CDU", label: "CDU", field: "F01.CDU", color: "#505050" },
    { key: "SPD", label: "SPD", field: "F04.SPD", color: "#cc2028" },
    { key: "GRUENE", label: "Grüne", field: "F06.GRÜNE", color: "#418940" },
    { key: "LINKE", label: "DIE LINKE", field: "F03.Die Linke", color: "#ce93d8" },
    { key: "BSW", label: "BSW", field: "F15.BSW", color: "#7a1e3a" },
    { key: "FDP", label: "FDP", field: "F05.FDP", color: "#fdb716" }
  ];

  const others = { key: "OTHERS", label: "Sonstige", color: "#999" };
  const allParties = [...parties, others];
  const cityIds = new Set(["M1", "M2", "M3", "M4", "H1", "H2", "H3", "H4"]);

  let cells = [];
  let outlinePaths = [];
  const patternTilt = 0;
  let tooltip = null;
  let tooltipVisible = false;
  let tooltipElement;
  let legendElement;
  let hoveredCellId = null;
  let lensCellId = null;
  let hideTooltipTimeout = null;
  const zoomScale = tweened(1, { duration: 480, easing: cubicInOut });
  let loading = true;
  let error = "";

  $: gridWidth = cells.length
    ? (Math.max(...cells.map((cell) => cell.col)) + 1) * (CELL_SIZE + cellPadding)
    : 0;
  $: overlayCells = lensCellId
    ? [...cells.filter((cell) => cell.id !== lensCellId), ...cells.filter((cell) => cell.id === lensCellId)]
    : cells;

  function number(value) {
    return Number(value) || 0;
  }

  function partyShares(cell) {
    const total = number(cell["F.Gültige.Zweitstimmen"]);
    const votes = parties.map((party) => ({ ...party, value: number(cell[party.field]) }));
    const knownVotes = votes.reduce((sum, party) => sum + party.value, 0);
    return [...votes, { ...others, value: Math.max(0, total - knownVotes) }]
      .map((party) => ({ ...party, share: total ? party.value / total : 0 }));
  }

  function partyOffset(cell, index) {
    return partyShares(cell)
      .slice(0, index)
      .reduce((sum, party) => sum + party.share, 0);
  }

  function showTooltip(cell, event) {
    if (hideTooltipTimeout) {
      clearTimeout(hideTooltipTimeout);
      hideTooltipTimeout = null;
    }

    tooltip = { cell, x: event.clientX, y: event.clientY };
    tooltipVisible = false;
    requestAnimationFrame(() => {
      tooltipVisible = true;
      requestAnimationFrame(positionTooltip);
    });
  }

  function moveTooltip(event) {
    if (tooltip) {
      tooltip = { ...tooltip, x: event.clientX, y: event.clientY };
      requestAnimationFrame(positionTooltip);
    }
  }

  function positionTooltip() {
    // The tooltip is positioned by the responsive side panel.
  }

  function hideTooltip() {
    if (hideTooltipTimeout) clearTimeout(hideTooltipTimeout);
    hideTooltipTimeout = window.setTimeout(() => {
      tooltipVisible = false;
      tooltip = null;
      hoveredCellId = null;
      zoomScale.set(1).then(() => {
        if (!hoveredCellId) lensCellId = null;
      });
    }, 80);
  }

  function setHoveredCell(cell) {
    hoveredCellId = cell.id;
    lensCellId = cell.id;
    zoomScale.set(1.72);
  }

  function toggleCell(cell, event) {
    if (hoveredCellId === cell.id) {
      hideTooltip();
      return;
    }

    setHoveredCell(cell);
    showTooltip(cell, event);
  }

  function cellTransform(cell, activeCellId, magnification) {
    const x = cell.col * (CELL_SIZE + cellPadding);
    const y = GRID_TOP + cell.row * (CELL_SIZE + cellPadding);

    if (cell.id !== activeCellId) return `translate(${x} ${y})`;

    const scale = magnification;
    const center = CELL_SIZE / 2;

    return `translate(${x - center * (scale - 1)} ${y - center * (scale - 1)}) scale(${scale})`;
  }

  function turnout(cell) {
    return number(cell["B.Wähler"]) / number(cell["A.Wahlberechtigte"]);
  }

  onMount(async () => {
    try {
      const [csvResponse, outlineResponse] = await Promise.all([
        fetch(`${import.meta.env.BASE_URL}files/c0885d8053ee3a5eaf42b31bce761e4de5373c52b3f677a756481e0414da376a614ca96124e6049fcb3d28dbf9796f8bbcc2fff0d371fc4096a0c39d01e80312.csv`),
        fetch(`${import.meta.env.BASE_URL}files/0267b6c66251eaf710bff60bb095e2ad690896ef271ad8ebfa79fc6ab2afef2f1d3edd3ca81ad398cce5e9e817b9652eb6adf228dd2f276b58bb53ba3d8ba6b3.geojson`)
      ]);

      if (!csvResponse.ok || !outlineResponse.ok) throw new Error("Die Wahldaten konnten nicht geladen werden.");

      const electionData = dsvFormat(";").parse(await csvResponse.text());
      const outline = await outlineResponse.json();
      const byNumber = new Map(electionData.map((row) => [row.Schlüsselnummer, row]));
      cells = layout.map((cell) => ({ ...cell, ...byNumber.get(String(cell.nr)) }));

      const projection = geoMercator().fitSize([600, 700], outline);
      const path = geoPath(projection);
      outlinePaths = outline.features.map((feature) => path(feature));
    } catch (loadError) {
      error = loadError.message;
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Landtagswahl 2026 | Sachsen-Anhalt</title>
</svelte:head>

<main>
  <h1>Landtagswahl Sachsen-Anhalt 2026</h1>

  {#if loading}
    <p class="status">Wahldaten werden geladen …</p>
  {:else if error}
    <p class="status error">{error}</p>
  {:else}
    <section class="visualization" aria-label="Karte der Wahlkreise">
      <div class="chart-wrap">
        <svg viewBox={`0 0 ${WIDTH} 850`} role="img" aria-label="Wahlkreiskarte Sachsen-Anhalt">
          <g class="outline" transform="translate(0 80) scale(1.3 1.1)">
            {#each outlinePaths as outlinePath}
              <path d={outlinePath} />
            {/each}
          </g>

          <defs>
            {#each cells as cell}
              <pattern id={`pattern-${cell.id}`} patternUnits="objectBoundingBox" viewBox="0 0 1 1" width="1" height="1" patternTransform={`rotate(${patternTilt})`}>
                {#each partyShares(cell) as party, index}
                  <rect x="0" y={partyOffset(cell, index)} width="1" height={party.share} fill={party.color} />
                {/each}
              </pattern>
            {/each}
          </defs>

          <g class="cells">
            {#each cells as cell}
              <g
                class:city={cityIds.has(cell.id)}
                class:active={cell.id === hoveredCellId}
                class="cell-group"
                role="img"
                aria-label={`Wahlkreis ${cell.Name}`}
                transform={cellTransform(cell, lensCellId, $zoomScale)}
                on:mouseenter={(event) => { setHoveredCell(cell); showTooltip(cell, event); }}
                on:mousemove={moveTooltip}
                on:mouseleave={hideTooltip}
              >
                <rect class="cell" width={CELL_SIZE} height={CELL_SIZE} rx="4" fill={`url(#pattern-${cell.id})`} />
                <text x={LABEL_PADDING_LEFT} y={LABEL_SIZE / 2} dominant-baseline="central">{cell.id}</text>
              </g>
            {/each}
          </g>

          <g class="active-cell-overlay-layer" aria-hidden="true">
            {#each overlayCells as cell (cell.id)}
              <g class:city={cityIds.has(cell.id)} class:active={cell.id === hoveredCellId} class="cell-group active-cell-overlay" transform={cellTransform(cell, lensCellId, $zoomScale)}>
                <rect class="cell" width={CELL_SIZE} height={CELL_SIZE} rx="4" fill={`url(#pattern-${cell.id})`} />
                <text x={LABEL_PADDING_LEFT} y={LABEL_SIZE / 2} dominant-baseline="central">{cell.id}</text>
              </g>
            {/each}
          </g>

          <g class="cell-hit-areas">
            {#each cells as cell}
              <g
                class="cell-hit-group"
                role="button"
                tabindex="0"
                aria-label={`Wahlkreis ${cell.Name}`}
                transform={`translate(${cell.col * (CELL_SIZE + cellPadding)} ${GRID_TOP + cell.row * (CELL_SIZE + cellPadding)})`}
                on:mouseenter={(event) => { setHoveredCell(cell); showTooltip(cell, event); }}
                on:mousemove={moveTooltip}
                on:mouseleave={hideTooltip}
                on:click={(event) => toggleCell(cell, event)}
                on:keydown={(event) => { if (event.key === "Enter" || event.key === " ") toggleCell(cell, event); }}
              >
                <rect class="cell-hit-area" width={CELL_SIZE} height={CELL_SIZE} rx="4" />
              </g>
            {/each}
          </g>

          <text class="credit" x="0" y="850" text-anchor="start">viu:lab Forschungsgruppe, HAW Hamburg</text>
        </svg>
      </div>

      <div class="map-side-panel">
        {#if tooltip}
          <div class="tooltip" class:visible={tooltipVisible} bind:this={tooltipElement}>
            <strong>Wahlkreis {tooltip.cell.Name}</strong>
            {#each partyShares(tooltip.cell) as party}
              <div class="tooltip-row"><span class="swatch" style={`background:${party.color}`}></span>{party.label}: {(party.share * 100).toFixed(1)}%</div>
            {/each}
            <div class="tooltip-turnout">Wahlbeteiligung: {(turnout(tooltip.cell) * 100).toFixed(1)}%</div>
          </div>
        {:else}
          <aside class="legend" aria-label="Legende" bind:this={legendElement}>
            <strong>Zweitstimmen</strong>
            {#each allParties as party}
              <div class="legend-item"><span class="swatch" style={`background:${party.color}`}></span>{party.label}</div>
            {/each}
            <div class="legend-divider"></div>
            <div class="legend-item"><span class="city-swatch"></span>Großstadt-Wahlkreis</div>
          </aside>
        {/if}
      </div>
    </section>
  {/if}
</main>