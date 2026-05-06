export class RouteTable {
  constructor({ table, state }) {
    this.table = table;
    this.state = state;
  }

  render() {
    const rows = this.state.boardData.routes
      .slice()
      .sort((a, b) => `${a.owner}${a.routeIndex}`.localeCompare(`${b.owner}${b.routeIndex}`))
      .map((route) => {
        const slotCount = this.state.boardData.repairSlots.filter((slot) => slot.routeId === route.routeId).length;
        const done = this.state.routes[route.routeId].completed ? "yes" : "no";
        return `
          <tr>
            <td>${route.routeId}</td>
            <td>${route.sourceId}</td>
            <td>${route.terminalId}</td>
            <td class="${route.terminalType}">${route.terminalType}</td>
            <td>${slotCount}</td>
            <td>${done}</td>
            <td>${route.mirrorRouteId}</td>
          </tr>
        `;
      })
      .join("");

    this.table.innerHTML = `
      <thead>
        <tr>
          <th>Route</th>
          <th>Source</th>
          <th>Terminal</th>
          <th>Type</th>
          <th>Slots</th>
          <th>Done</th>
          <th>Mirror</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    `;
  }
}
