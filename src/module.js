import { loadPluginCss, MetricsPanelCtrl } from 'app/plugins/sdk';
import { debounce, defaults, range, zip } from 'lodash-es';
import * as d3 from 'd3';
//import "./css/base.css"


loadPluginCss({
  dark: 'plugins/spectraphilic-windrose-panel/css/dark.css',
  light: 'plugins/spectraphilic-windrose-panel/css/light.css'
});

const panelDefaults = {
  // X axis
  slices: 32,
  // Y axis
  start: 0,
  step: '',
  unit: 'm/s',
  scale: 'absolute'
};

class WindroseCtrl extends MetricsPanelCtrl {

  constructor($scope, $injector) {
    super($scope, $injector);
    defaults(this.panel, panelDefaults);
    this.events.on('data-error', this.onDataError.bind(this));
    this.events.on('data-received', this.onDataReceived.bind(this));
    this.events.on('init-edit-mode', this.onInitEditMode.bind(this));

    const render = this.onRender.bind(this);
    this.events.on('render', render);

    // When viewing a single panel resizing the window does not emit
    // panel-size-changed (but it does when looking a dashboard).
    window.addEventListener('resize', debounce(render, 200));

    //this.events.on('data-snapshot-load', () => { console.log('data-snapshot-load'); });
    //this.events.on('panel-size-changed', () => { console.log('panel-size-changed'); });
    //this.events.on('panel-teardown', () => { console.log('panel-teardown'); });
    //this.events.on('refresh', () => { console.log('refresh'); });
  }

  onInitEditMode() {
    console.debug('init-edit-mode');
    const template = 'public/plugins/spectraphilic-windrose-panel/editor.html';
    this.addEditorTab('Options', template, 2);
  }

  onDataError(err) {
    console.error('data-error', err);
  }

  // Helper function. Returns an array with the intervals from 'start' to 'end'
  // defined either by the number of intervals (n) or by the size of the
  // intervals (step). Examples:
  // getIntervals(0, 360, {n: 3})     => [[0, 120], [120, 240], [240, 360]]
  // getIntervals(0, 100, {step: 30}) => [[0, 30], [30, 60], [60, 90], [90, 120]]
  getIntervals(start, end, options) {
    const d = end - start;
    let n = options.n;
    let s = options.step;

    if (n) s = d / n;
    else if (s) n = Math.ceil(d / s);

    return Array(n).fill().map((_, i) => [start + i * s, start + (i+1) * s]);
  }

  // Helper function. Given a value and an array of sorted intervals, return
  // the index of the interval the value belongs to. The first element of the
  // array defines the minimum allowed value, the last element of the array
  // defines the maximum allowed value.
  getIntervalIndex(value, array) {
    // Check value
    if (value === null) {
      console.debug('Unexpected value is null');
      return null;
    }

    // Below lower limit
    if (value < array[0][0]) {
      return null;
    }

    // Within range
    for (let i=0; i < array.length; i++) {
      let low = array[i][0];
      let high = array[i][1];
      if (value >= low && value <= high) {
        return i;
      }
    }

    // Above upper limit
    console.warn('Unexpected ' + value + ' greater than ' + array[array.length-1][1]);
    return null;
  }


  onDataReceived(data) {
    let speeds = [];
    let angles = [];
    for (let serie of data) {
      let datapoints = serie.datapoints.map(x => x[0]);
      if (serie.target === 'speed') {
        speeds = datapoints;
      } else if (serie.target === 'direction') {
        angles = datapoints;
      } else {
        console.warn('unexpected target ' + serie.target);
      }
    }

    this.speedMax = speeds.length > 0 ? Math.max(...speeds) : 0;
    this.data = zip(angles, speeds).filter(x => x[1] != null);
    this.render()
  }


  onRender() {
    //console.debug(this);

    // Data
    const raw = this.data;

    // Configuration
    const panel = this.panel;
    const slices = +panel.slices;
    const start = +panel.start;
    const step = (panel.step == '') ? Math.ceil(this.speedMax / 8): +panel.step;
    const unit = panel.unit;
    const scale = panel.scale;

    // Intervals
    const angleIntervals = this.getIntervals(0, 360, {n: slices});
    const speedIntervals = this.getIntervals(start, this.speedMax, {step: step});
    //console.debug(this.speedMax);
    //console.debug('angleIntervals=', angleIntervals);
    //console.debug('speedIntervals=', speedIntervals);

    // [angle-index][speed-index] = 0
    const matrix = [...Array(angleIntervals.length)].map(x => Array(speedIntervals.length).fill(0));
    // [angle-index][speed-index] = n
    for (let i=0; i < raw.length; i++) {
      let j = this.getIntervalIndex(raw[i][0], angleIntervals);
      let k = this.getIntervalIndex(raw[i][1], speedIntervals);
      if (j != null && k != null) {
        matrix[j][k]++;
      }
    }
    //console.debug('matrix=', matrix);


    // x = direction - angle
    // y = count     - radius
    // z = speed     - color

    // Columns
    const zLabels = speedIntervals.map(x => x[0] + ' - ' + x[1]);
    //console.debug('zLabels=', zLabels);

    // [{angle: angle, 0: count-0, ..., n-1: count-n-1, total: count-total} ... ]
    const data = [];
    for (let i=0; i < angleIntervals.length; i++) {
      const row = {
        angle: angleIntervals[i][0]
      };
      let total = 0;
      for (let j=0; j < speedIntervals.length; j++) {
        let name = zLabels[j];
        total += row[name] = matrix[i][j];
      }
      row['total'] = total;
      data.push(row);
    }
    //console.debug('data=', data);

    // Percent
    if (scale == 'percent') {
      const max = d3.sum(data, d => d.total);
      const tmpScale = d3.scaleLinear([0, max], [0, 1]);
      for (let i=0; i < data.length; i++) {
        for (let key in data[i]) {
          if (key != 'angle') {
            data[i][key] = tmpScale(data[i][key]);
          }
        }
      }
      //console.debug('data(percent)=', data);
    }

    // SVG
    const svg = d3.select("svg#windrose-" + panel.id);
    svg.selectAll('*').remove(); // Remove children
    const node = svg.node().parentNode,
          width = node.offsetWidth,
          height = node.offsetHeight;
    svg.attr('width', width).attr('height', height); // Set width and height
    const g = svg.append("g"); // Add <g>
    g.attr("transform", "translate(" + width / 2 + "," + height / 2 + ")"); // Center <g>

    // Radius
    const margin = {top: 40, right: 80, bottom: 40, left: 40},
          innerRadius = 0,
          chartWidth = width - margin.left - margin.right,
          chartHeight = height - margin.top - margin.bottom,
          outerRadius = Math.min(chartWidth, chartHeight) / 2;
    const yRange = [innerRadius, outerRadius];

    // X-Axis
    const radiansRange = [0, 2 * Math.PI];
    const getRadiansFromDegrees = d3.scaleLinear([0, 360], radiansRange);

    // Y-axis
    const yMax = d3.max(data, d => d.total);
    const getRadius = d3.scaleLinear([0, yMax], yRange);

    // Z-axis: map speed interval labels to colors
    const getColor = d3.scaleOrdinal(zLabels, ["#4242f4", "#42c5f4", "#42f4ce", "#42f456",
                                               "#adf442", "#f4e242", "#f4a142", "#f44242"]);

    // Draw 1 arc for every speed interval in every direction
    const arcWidth = d3.scaleBand(data.map(d => d.angle), radiansRange).align(0).bandwidth();
    g.append("g")
        // One <g> element per speed interval (color)
        .selectAll("g")
        .data(d3.stack().keys(zLabels)(data))
        .enter().append("g")
        .attr("fill", d => getColor(d.key))
        // One <path> (arc) per spee-interval and direction
        .selectAll("path")
        .data(d => d)
        .enter().append("path")
        .attr("d", d3.arc().innerRadius(d => getRadius(d[0]))
                           .outerRadius(d => getRadius(d[1]))
                           .startAngle(d => getRadiansFromDegrees(d.data.angle))
                           .endAngle(d => getRadiansFromDegrees(d.data.angle) + arcWidth)
                           .padAngle(0.01)
                           .padRadius(innerRadius));

    // X axis (angle)
    const gridN = 8;
    const gridX = range(0, 360, 360 / gridN);
    const xScale = d3.scaleLinear([0, gridN], radiansRange); // Extend the domain slightly to match the range [0, 2π]

    // Draw the text label (degrees)
    const xGridWidth = d3.scaleBand(gridX, radiansRange).align(0).bandwidth();
    const angleOffset = -360.0/gridX.length/2.0;
    const label = g.append("g")
        // One <g> element per x-grid line
        .selectAll("g")
        .data(gridX)
        .enter().append("g")
        .attr("text-anchor", "middle")
        .attr("transform", d => {
          let rotate = ((getRadiansFromDegrees(d) + xGridWidth / 2) * 180 / Math.PI - (90-angleOffset));
          return "rotate(" + rotate + ")translate(" + (outerRadius+30) + ",0)";
        })
        // <text> element
        .append("text")
        .attr("transform", d => {
          return ((getRadiansFromDegrees(d) + xGridWidth / 2 + Math.PI / 2) % (2 * Math.PI) < Math.PI)
            ? "rotate(90)translate(0,16)"
            :  "rotate(-90)translate(0,-9)";
        })
        .attr('fill', 'white')
        .text(d => d)
        .style("font-size", '14px');

    const radius = d3.scaleLinear([0, d3.max(gridX, d => d.y0 + d.y)], yRange);
    g.selectAll(".axis")
        .data(d3.range(xScale.domain()[1]))
        .enter().append("g")
        .attr("class", "axis")
        .attr("transform", d => "rotate(" + xScale(d) * 180 / Math.PI + ")")
        .call(d3.axisLeft().scale(radius.copy().range([-innerRadius, -(outerRadius+10)])));

    // Y axis
    var yAxis = g.append("g").attr("text-anchor", "middle");
    var yTick = yAxis
        .selectAll("g")
        .data(getRadius.ticks(5).slice(1))
        .enter().append("g");

    // Y axis: circles
    yTick.append("circle")
        .attr("fill", "none")
        .attr("stroke", "gray")
        .attr("stroke-dasharray", "4,4")
        .attr("r", getRadius);

    // Y axis: labels
    yTick.append("text")
        .attr("y", d => -getRadius(d))
        .attr("dy", "-0.35em")
        .attr("x", () => -10)
        .text(getRadius.tickFormat(5, scale == 'percent' ? "%" : "s"))
        .attr('fill', 'white')
        .style("font-size", '14px');

    // Legend
    var legend = g.append("g")
        .selectAll("g")
        .data(zLabels.slice().reverse())
        .enter().append("g")
        .attr("transform", function(d, i) {
          let translate_x = outerRadius + 30;
          let translate_y = -outerRadius + 40 + (i - zLabels.length / 2) * 20;
          return "translate(" + translate_x + "," + translate_y + ")";
        });

    legend.append("rect")
        .attr("width", 18)
        .attr("height", 18)
        .attr("fill", getColor);

    legend.append("text")
        .attr("x", 24)
        .attr("y", 9)
        .attr("dy", "0.35em")
        .text(d => d + ' ' + unit)
        .attr('fill', 'white')
        .style("font-size", '12px');

  }

}

WindroseCtrl.templateUrl = 'module.html';

export {
  WindroseCtrl as PanelCtrl
};
