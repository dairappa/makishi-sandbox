(() => {
  const { Engine, Render, Runner, World, Bodies, Body, Events, Composite } = Matter;

  const STAGE_W = 400;
  const STAGE_H = 560;
  const WALL_T = 20;
  const DROP_LINE_Y = 80;
  const GAMEOVER_LINE_Y = 70;

  // フルーツ定義: 半径、色、スコア、絵文字
  const FRUITS = [
    { r: 14, color: '#e74c3c', score: 1,   emoji: '🍒' },
    { r: 19, color: '#f5a3c7', score: 3,   emoji: '🍓' },
    { r: 24, color: '#a569bd', score: 6,   emoji: '🍇' },
    { r: 30, color: '#f39c12', score: 10,  emoji: '🍊' },
    { r: 38, color: '#e67e22', score: 15,  emoji: '🍑' },
    { r: 46, color: '#f1c40f', score: 21,  emoji: '🍎' },
    { r: 56, color: '#ff7979', score: 28,  emoji: '🍐' },
    { r: 68, color: '#ffb142', score: 36,  emoji: '🍍' },
    { r: 80, color: '#fffa65', score: 45,  emoji: '🍈' },
    { r: 96, color: '#26ae60', score: 55,  emoji: '🍉' },
  ];
  const MAX_LEVEL = FRUITS.length - 1;

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const nextCanvas = document.getElementById('next-canvas');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const finalEl = document.getElementById('final-score');
  const overEl = document.getElementById('gameover');
  const resetBtn = document.getElementById('reset-btn');
  const retryBtn = document.getElementById('retry-btn');

  stage.style.width = STAGE_W + 'px';
  stage.style.height = STAGE_H + 'px';
  canvas.width = STAGE_W;
  canvas.height = STAGE_H;
  const ctx = canvas.getContext('2d');
  const nctx = nextCanvas.getContext('2d');

  let engine, world;
  let runner;
  let nextLevel = 0;
  let queuedLevel = 0;
  let pointerX = STAGE_W / 2;
  let canDrop = true;
  let score = 0;
  let best = +(localStorage.getItem('suika-best') || 0);
  let gameOver = false;
  let overTimer = null; // 上に乗っている時間カウント

  bestEl.textContent = best;

  function init() {
    if (runner) Runner.stop(runner);
    if (engine) World.clear(engine.world, false);

    engine = Engine.create({
      gravity: { x: 0, y: 1, scale: 0.0014 },
    });
    world = engine.world;

    // 壁
    const wallOpts = {
      isStatic: true,
      restitution: 0.1,
      friction: 0.5,
      render: { fillStyle: '#b88747' },
    };
    const floor = Bodies.rectangle(STAGE_W / 2, STAGE_H + WALL_T / 2, STAGE_W + WALL_T * 2, WALL_T, wallOpts);
    const left = Bodies.rectangle(-WALL_T / 2, STAGE_H / 2, WALL_T, STAGE_H * 2, wallOpts);
    const right = Bodies.rectangle(STAGE_W + WALL_T / 2, STAGE_H / 2, WALL_T, STAGE_H * 2, wallOpts);
    World.add(world, [floor, left, right]);

    runner = Runner.create();
    Runner.run(runner, engine);

    Events.on(engine, 'collisionStart', onCollision);
    Events.on(engine, 'afterUpdate', checkGameOver);

    score = 0;
    gameOver = false;
    canDrop = true;
    overTimer = null;
    nextLevel = randomDropLevel();
    queuedLevel = randomDropLevel();
    overEl.classList.remove('show');
    updateScore(0);
    drawNext();
  }

  function randomDropLevel() {
    // 0〜4 のフルーツがランダムに出る
    const r = Math.random();
    if (r < 0.35) return 0;
    if (r < 0.65) return 1;
    if (r < 0.85) return 2;
    if (r < 0.95) return 3;
    return 4;
  }

  function spawnFruit(x, y, level, options = {}) {
    const f = FRUITS[level];
    const body = Bodies.circle(x, y, f.r, {
      restitution: 0.18,
      friction: 0.4,
      frictionAir: 0.005,
      density: 0.0012 + level * 0.0001,
      label: 'fruit',
      ...options,
    });
    body.fruitLevel = level;
    body.justDropped = options.justDropped ?? false;
    World.add(world, body);
    return body;
  }

  function dropFruit() {
    if (!canDrop || gameOver) return;
    const level = nextLevel;
    const f = FRUITS[level];
    const x = clamp(pointerX, f.r + 4, STAGE_W - f.r - 4);
    spawnFruit(x, DROP_LINE_Y, level, { justDropped: true });
    nextLevel = queuedLevel;
    queuedLevel = randomDropLevel();
    drawNext();
    canDrop = false;
    setTimeout(() => { canDrop = true; }, 450);
  }

  function onCollision(ev) {
    const merged = new Set();
    for (const pair of ev.pairs) {
      const { bodyA, bodyB } = pair;
      if (bodyA.label !== 'fruit' || bodyB.label !== 'fruit') continue;
      if (merged.has(bodyA.id) || merged.has(bodyB.id)) continue;
      if (bodyA.fruitLevel !== bodyB.fruitLevel) continue;
      if (bodyA.fruitLevel >= MAX_LEVEL) continue;

      const lvl = bodyA.fruitLevel;
      const newLevel = lvl + 1;
      const nx = (bodyA.position.x + bodyB.position.x) / 2;
      const ny = (bodyA.position.y + bodyB.position.y) / 2;
      merged.add(bodyA.id);
      merged.add(bodyB.id);
      World.remove(world, bodyA);
      World.remove(world, bodyB);
      const newBody = spawnFruit(nx, ny, newLevel);
      // 合体時に少しはじける感じ
      Body.setVelocity(newBody, { x: 0, y: -1.5 });

      updateScore(FRUITS[newLevel].score);

      if (newLevel === MAX_LEVEL) {
        // スイカ完成ボーナス
        updateScore(100);
      }
    }
  }

  function checkGameOver() {
    if (gameOver) return;
    const bodies = Composite.allBodies(world);
    let overFruit = false;
    for (const b of bodies) {
      if (b.label !== 'fruit') continue;
      // ドロップ直後は判定しない、また落下中（速度がある）は判定しない
      if (b.justDropped) {
        if (b.position.y - b.circleRadius > DROP_LINE_Y + 4) {
          b.justDropped = false;
        }
        continue;
      }
      if (Math.abs(b.velocity.y) > 0.5) continue;
      if (b.position.y - b.circleRadius < GAMEOVER_LINE_Y) {
        overFruit = true;
        break;
      }
    }
    if (overFruit) {
      if (overTimer === null) overTimer = performance.now();
      else if (performance.now() - overTimer > 1500) triggerGameOver();
    } else {
      overTimer = null;
    }
  }

  function triggerGameOver() {
    gameOver = true;
    canDrop = false;
    if (score > best) {
      best = score;
      localStorage.setItem('suika-best', best);
      bestEl.textContent = best;
    }
    finalEl.textContent = score;
    overEl.classList.add('show');
  }

  function updateScore(delta) {
    score += delta;
    scoreEl.textContent = score;
  }

  function drawNext() {
    nctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const f = FRUITS[queuedLevel];
    const cx = nextCanvas.width / 2;
    const cy = nextCanvas.height / 2;
    const r = Math.min(20, f.r * 0.6);
    nctx.beginPath();
    nctx.fillStyle = f.color;
    nctx.arc(cx, cy, r, 0, Math.PI * 2);
    nctx.fill();
    nctx.font = `${r * 1.4}px serif`;
    nctx.textAlign = 'center';
    nctx.textBaseline = 'middle';
    nctx.fillText(f.emoji, cx, cy + 1);
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // 描画ループ（自前で描く）
  function render() {
    ctx.clearRect(0, 0, STAGE_W, STAGE_H);

    // ゲームオーバーライン
    ctx.strokeStyle = 'rgba(255, 123, 84, 0.6)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, GAMEOVER_LINE_Y);
    ctx.lineTo(STAGE_W, GAMEOVER_LINE_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 次のフルーツの落下位置ガイド
    if (!gameOver && canDrop) {
      const f = FRUITS[nextLevel];
      const x = clamp(pointerX, f.r + 4, STAGE_W - f.r - 4);
      ctx.strokeStyle = 'rgba(184, 135, 71, 0.4)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, DROP_LINE_Y + f.r);
      ctx.lineTo(x, STAGE_H);
      ctx.stroke();
      ctx.setLineDash([]);

      // 落下予定のフルーツ
      drawFruit(ctx, x, DROP_LINE_Y, 0, f);
    }

    // フルーツ描画
    const bodies = Composite.allBodies(world);
    for (const b of bodies) {
      if (b.label !== 'fruit') continue;
      drawFruit(ctx, b.position.x, b.position.y, b.angle, FRUITS[b.fruitLevel]);
    }

    requestAnimationFrame(render);
  }

  function drawFruit(g, x, y, angle, f) {
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    // 影
    g.beginPath();
    g.fillStyle = f.color;
    g.arc(0, 0, f.r, 0, Math.PI * 2);
    g.fill();
    // ハイライト
    g.beginPath();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.arc(-f.r * 0.35, -f.r * 0.4, f.r * 0.3, 0, Math.PI * 2);
    g.fill();
    // 縁
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.beginPath();
    g.arc(0, 0, f.r, 0, Math.PI * 2);
    g.stroke();
    // 絵文字
    const fs = Math.max(12, f.r * 1.0);
    g.font = `${fs}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(f.emoji, 0, 1);
    g.restore();
  }

  // 入力処理
  function getX(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX);
    return (cx - rect.left) * (STAGE_W / rect.width);
  }
  canvas.addEventListener('mousemove', (e) => { pointerX = getX(e); });
  canvas.addEventListener('mousedown', (e) => { pointerX = getX(e); dropFruit(); });
  canvas.addEventListener('touchmove', (e) => { pointerX = getX(e); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchstart', (e) => { pointerX = getX(e); }, { passive: true });
  canvas.addEventListener('touchend', () => { dropFruit(); });

  resetBtn.addEventListener('click', init);
  retryBtn.addEventListener('click', init);

  init();
  render();
})();
