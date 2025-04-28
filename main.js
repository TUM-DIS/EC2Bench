// main.js
// Orchestrates components: state manager, code editors, database querying, and table rendering
import state from './components/state.js';
import CodeEditor from './components/CodeEditor.js';
import DB from './components/db.js';
import ResultTable from './components/ResultTable.js';
import ErrorMessage from './components/ErrorMessage.js';
import ResizeHandle from './components/ResizeHandle.js';

const showToast = (message) => {
    const toast = $("#toast").text(message).addClass("show");
    setTimeout(() => { toast.removeClass("show"); }, 2000);
}

const app = {};
////////////////////////  SQL Editor  ///////////////////////
document.addEventListener('DOMContentLoaded', async () => {
  // Run query based on current state.sqlQuery
  async function runQuery() {
    state.setState({ sqlError: '' });
    const query = state.getState().sqlQuery;
    let result;
    try {
      result = await app.db.query(query);
    } catch (err) {
      result = { error: err.toString() };
    }
    if (result.error) {
      state.setState({ result: { columns: [], rows: [], query }, sqlError: result.error });
    } else {
      state.setState({ result: { columns: result.columns, rows: result.rows, query }, sqlError: '' });
    }
  }

  // SQL Code Editor
  app.sqlEditor = new CodeEditor('#sql-editor', {
    mode: 'text/x-sql',
    stateKey: 'sqlQuery',
    // handled in global ctrlenter listener below
    // extraKeys: { 'Ctrl-Enter': runQuery }
  });
  // error message for SQL
  app.sqlError = new ErrorMessage('#sql-status', 'sqlError');

  // Initialize database and result table
  app.db = await DB.create();
  app.resultTable = new ResultTable('#sql-output');

  // Handle state updates for query results
  state.subscribe((newState, updates) => {
    const { columns, rows, query } = newState.result;
    app.resultTable.render(columns, rows, query);
    if (window.rmodule) {
      window.rmodule.onDataUpdate({ columns, rows });
    }
  }, ['result', 'viewsize']);

  // Load table button
  document.getElementById('load-table').addEventListener('click', async (e) => {
    e.preventDefault();
    await runQuery();
  });

  // Fallback Ctrl+Enter
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === 'Enter') {
      runQuery();
    }
  });

  await runQuery();
});

////////////////////////  R module  ///////////////////////
document.addEventListener('DOMContentLoaded', async () => {
  const RRepl = await import('./components/RRepl.js');
  // error message for R
  app.rError = new ErrorMessage('#r-status', 'rError');
  // Prepare R evaluation area
  app.rEditor = new CodeEditor("#r-editor", {
    mode: 'text/x-rsrc',
    stateKey: 'rCode',
    // handled in global ctrlenter listener
    // extraKeys: { 'Ctrl-Enter': () => evalR() },
    overrides: { lineNumbers: false }
  });

  // Initialize R environment
  const outputElem = 'r-output';
  app.repl = await RRepl.default.initialize(outputElem);
  async function evalR() {
    const { rCode, result } = state.getState();
    const res = await app.repl.eval(rCode, result);
    if (res.error) {
      state.setState({ rError: res.error });
    } else {
      state.setState({ rError: '', rOutput: res.svg });
      document.getElementById(outputElem).innerHTML = res.svg;
    }
  }
  // 'Execute R' button
  // document.getElementById('execute-r').addEventListener('click', async (e) => {await evalR();});

  // evaluate R when sql state changes
  state.subscribe((newState, updates) => {
    if (newState.sqlError) { return; }
    if ('viewsize' in updates) {
      app.rEditor.refresh();
    }
    evalR();
  }, ['result', 'viewsize']);

  // Initial query to populate table based on URL/state
  await evalR();
});

////////////////////////  Window Resizing, Global Buttons, etc.   ///////////////////////
document.addEventListener('DOMContentLoaded', () => {
  state.subscribe((newState, updates) => {
    // don't save when there are errors is empty
    if (newState.sqlError || newState.rError) { return; }
    if ('result' in updates || 'rOutput' in updates) {
      state.saveState();
    }
  }, ['result', 'rOutput']);

  // button for sharing url
  $('#share-btn').click(() => {
    // state.saveState();
    const text = window.location.href;
    navigator.clipboard.writeText(text).then(() => {
      showToast("Link copied to clipboard!");
    }).catch(err => console.error("Failed to copy: ", err));
  });

  // button for downloading svg
  $('#svg-dl-btn').click(() => {
    const svgData = state.getState().rOutput;
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    // download
    window.open(url, '_blank');
  });

  // button for resetting page
  $('#reset-btn').click((e) => {
    const newUrl = window.location.origin + window.location.pathname;
    window.location = newUrl;
  });

  // buttons for changing view type
  $('#toggle-viz-btn').click((e) => {
    let elem = $('#app');
    if (elem.hasClass('splitview')) {
      elem.removeClass('splitview').addClass('tableview');
      $('#toggle-viz-btn').html('&#9664; Visualize');
    } else {
      elem.removeClass('tableview').addClass('splitview');
      $('#toggle-viz-btn').html('Table only &#9654;');
    }
    // clear all styles set in the meantime
    elem.removeAttr("style");
    state.setState({ viewsize: window.innerWidth });
  });

  // grid resize drag handler
  app.resizeHandle = new ResizeHandle('.splitview', '#grid-resize', (pct) => {
    state.setState({ viewsize: window.innerWidth * pct } );
  });

  // public resize event on window resize as well
  window.addEventListener('resize', () => {
    state.setState({ viewsize: window.innerWidth })
  });
});
