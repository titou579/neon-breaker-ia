'use strict';

// ============================================================
// NEON BREAKER - Vanilla JS Arcade Game
// No external dependencies
// ============================================================

// ==================== CONSTANTS ====================
var CANVAS_WIDTH = 800;
var CANVAS_HEIGHT = 600;
var PADDLE_WIDTH = 120;
var PADDLE_HEIGHT = 16;
var PADDLE_Y_OFFSET = 40;
var PADDLE_SPEED = 500;
var BALL_RADIUS = 8;
var BALL_BASE_SPEED = 340;
var BRICK_COLS = 10;
var BRICK_WIDTH = 64;
var BRICK_HEIGHT = 24;
var BRICK_PADDING = 4;
var BRICK_OFFSET_TOP = 80;
var BRICK_OFFSET_LEFT = (CANVAS_WIDTH - (BRICK_COLS * BRICK_WIDTH + (BRICK_COLS - 1) * BRICK_PADDING)) / 2;
var MAX_PARTICLES = 300;
var POWERUP_DROP_CHANCE = 0.15;
var POWERUP_SPEED = 150;
var POWERUP_DURATION = 10000;
var TICK_RATE = 1000 / 60;
var MAX_LIVES = 3;

// Game states
var STATE_MENU = 'menu';
var STATE_PLAYING = 'playing';
var STATE_PAUSED = 'paused';
var STATE_LEVEL_COMPLETE = 'levelComplete';
var STATE_GAME_OVER = 'gameOver';
var STATE_VICTORY = 'victory';

// Brick type definitions
var BRICK_TYPES = {
  NORMAL: { hits: 1, points: 10, colors: ['#4af0c0', '#3ad5a8'] },
  TOUGH:  { hits: 2, points: 30, colors: ['#ffaa22', '#ff8822', '#ff6622'] },
  STRONG: { hits: 3, points: 50, colors: ['#ff4466', '#ff3355', '#ff2244', '#ff1133'] },
};

// Power-up type definitions
var POWERUP_TYPES = {
  EXPAND: { color: '#4af0c0', label: 'RAQUETTE LARGE', symbol: 'W' },
  SLOW:   { color: '#5591c7', label: 'BALLE LENTE', symbol: 'S' },
};

// Level layouts (0 = empty, 1 = normal, 2 = tough, 3 = strong)
var LEVELS = [
  // Level 1 - Introduction
  [
    '0000000000',
    '0111111110',
    '0111111110',
    '0111111110',
  ],
  // Level 2 - Pyramid
  [
    '0000110000',
    '0001111000',
    '0011111100',
    '0111111110',
  ],
  // Level 3 - Checkerboard
  [
    '1010101010',
    '0101010101',
    '1010101010',
    '0101010101',
  ],
  // Level 4 - Fortress
  [
    '0222222220',
    '0211111120',
    '0211331120',
    '0211111120',
    '0222222220',
  ],
  // Level 5 - Final Challenge
  [
    '2222222222',
    '2333333322',
    '3333333333',
    '2333333322',
    '2222222222',
  ],
];

// ==================== UTILITY FUNCTIONS ====================
function clamp(val, min, max) {
  return val < min ? min : (val > max ? max : val);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function randRange(min, max) {
  return Math.random() * (max - min) + min;
}

// ==================== GAME STATE ====================
var gameState = {
  current: STATE_MENU,
  score: 0,
  lives: MAX_LIVES,
  level: 1,
  highScore: 0,
  combo: 0,
};

// ==================== ENTITIES ====================
var ball = {
  x: 400,
  y: 500,
  vx: 0,
  vy: 0,
  r: BALL_RADIUS,
  stuck: true,
};

var paddle = {
  x: (CANVAS_WIDTH - PADDLE_WIDTH) / 2,
  y: CANVAS_HEIGHT - PADDLE_Y_OFFSET,
  w: PADDLE_WIDTH,
  h: PADDLE_HEIGHT,
  targetX: null,
};

var bricks = [];
var particles = [];
var powerUps = [];
var ballTrail = [];
var activePowerUp = { type: null, timer: 0, active: false };

// Effect multipliers
var shakeIntensity = 0;
var speedMultiplier = 1.0;
var paddleWidthMultiplier = 1.0;

// Input tracking
var inputMode = 'keyboard';
var mouseTargetX = null;
var reducedMotion = false;

// Canvas references (set in init)
var canvas = null;
var ctx = null;

// ==================== INPUT SYSTEM ====================
var Input = {
  keys: {},

  init: function () {
    var self = this;
    document.addEventListener('keydown', function (e) {
      self.keys[e.code] = true;
    });
    document.addEventListener('keyup', function (e) {
      self.keys[e.code] = false;
    });
  },

  isDown: function (code) {
    return !!this.keys[code];
  },
};

// ==================== AUDIO SYSTEM ====================
var Sound = {
  ctx: null,
  muted: false,

  init: function () {
    if (!this.ctx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          this.ctx = new AC();
        }
      } catch (e) {
        // Audio not supported
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  play: function (frequency, duration, type, volume) {
    if (!this.ctx || this.muted) return;
    try {
      var osc = this.ctx.createOscillator();
      var gain = this.ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
      gain.gain.setValueAtTime(volume || 0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Ignore audio errors
    }
  },

  bounce: function () {
    this.play(440, 0.05, 'square', 0.15);
  },

  brickBreak: function () {
    this.play(800, 0.06, 'sine', 0.2);
    var self = this;
    setTimeout(function () { self.play(600, 0.04, 'sine', 0.15); }, 30);
  },

  brickHit: function () {
    this.play(500, 0.04, 'square', 0.1);
  },

  powerUp: function () {
    var self = this;
    this.play(523, 0.08, 'sine', 0.2);
    setTimeout(function () { self.play(659, 0.08, 'sine', 0.2); }, 70);
    setTimeout(function () { self.play(784, 0.12, 'sine', 0.2); }, 140);
  },

  loseLife: function () {
    this.play(200, 0.25, 'sawtooth', 0.2);
    var self = this;
    setTimeout(function () { self.play(150, 0.25, 'sawtooth', 0.2); }, 100);
  },

  levelComplete: function () {
    var notes = [523, 659, 784, 1047];
    var self = this;
    for (var i = 0; i < notes.length; i++) {
      (function (idx) {
        setTimeout(function () { self.play(notes[idx], 0.12, 'sine', 0.2); }, idx * 90);
      })(i);
    }
  },

  gameOver: function () {
    var notes = [400, 350, 300, 250];
    var self = this;
    for (var i = 0; i < notes.length; i++) {
      (function (idx) {
        setTimeout(function () { self.play(notes[idx], 0.2, 'sawtooth', 0.2); }, idx * 140);
      })(i);
    }
  },
};

// ==================== HELPER: ROUNDED RECTANGLE ====================
function roundRect(ctx, x, y, w, h, r) {
  var radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// ==================== PARTICLE SYSTEM ====================
function spawnParticles(x, y, color, count) {
  if (reducedMotion) count = Math.min(count, 4);
  for (var i = 0; i < count; i++) {
    if (particles.length >= MAX_PARTICLES) break;
    var angle = Math.random() * Math.PI * 2;
    var speed = 50 + Math.random() * 150;
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 1.0,
      color: color,
      size: 3 + Math.random() * 3,
    });
  }
}

function updateParticles(dt) {
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 200 * dt;
    p.vx *= 0.98;
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

// ==================== LEVEL BUILDING ====================
function buildLevel(levelNum) {
  var layout = LEVELS[levelNum - 1];
  bricks = [];

  for (var row = 0; row < layout.length; row++) {
    for (var col = 0; col < layout[row].length; col++) {
      var cell = parseInt(layout[row][col], 10);
      if (cell === 0 || isNaN(cell)) continue;

      var type = null;
      if (cell === 1) type = 'NORMAL';
      else if (cell === 2) type = 'TOUGH';
      else if (cell === 3) type = 'STRONG';

      if (!type) continue;

      bricks.push({
        x: BRICK_OFFSET_LEFT + col * (BRICK_WIDTH + BRICK_PADDING),
        y: BRICK_OFFSET_TOP + row * (BRICK_HEIGHT + BRICK_PADDING),
        w: BRICK_WIDTH,
        h: BRICK_HEIGHT,
        type: type,
        hitsTaken: 0,
        destroyed: false,
      });
    }
  }
}

// ==================== BALL AND PADDLE LOGIC ====================
function getEffectivePaddleWidth() {
  return paddle.w * paddleWidthMultiplier;
}

function getLevelSpeedMultiplier() {
  return 1 + (gameState.level - 1) * 0.15;
}

function resetBall() {
  ball.stuck = true;
  var pw = getEffectivePaddleWidth();
  ball.x = paddle.x + pw / 2;
  ball.x = clamp(ball.x, ball.r, CANVAS_WIDTH - ball.r);
  ball.y = paddle.y - ball.r - 2;
  ball.vx = 0;
  ball.vy = 0;
  gameState.combo = 0;
  ballTrail = [];
}

function launchBall() {
  if (!ball.stuck) return;
  ball.stuck = false;
  var angle = (Math.random() - 0.5) * (Math.PI / 3);
  var speed = BALL_BASE_SPEED * getLevelSpeedMultiplier();
  ball.vx = speed * Math.sin(angle);
  ball.vy = -speed * Math.cos(angle);
}

function updatePaddle(dt) {
  var pw = getEffectivePaddleWidth();

  if (inputMode === 'mouse' && mouseTargetX !== null) {
    paddle.x = lerp(paddle.x, mouseTargetX, 0.3);
  } else {
    if (Input.isDown('ArrowLeft') || Input.isDown('KeyA')) {
      paddle.x -= PADDLE_SPEED * dt;
    }
    if (Input.isDown('ArrowRight') || Input.isDown('KeyD')) {
      paddle.x += PADDLE_SPEED * dt;
    }
  }

  paddle.x = clamp(paddle.x, 0, CANVAS_WIDTH - pw);
}

function updateBall(dt) {
  if (ball.stuck) {
    var pw = getEffectivePaddleWidth();
    ball.x = paddle.x + pw / 2;
    ball.x = clamp(ball.x, ball.r, CANVAS_WIDTH - ball.r);
    ball.y = paddle.y - ball.r - 2;
    return;
  }

  // Move ball with speed multiplier
  var evx = ball.vx * speedMultiplier;
  var evy = ball.vy * speedMultiplier;
  ball.x += evx * dt;
  ball.y += evy * dt;

  // Add trail
  ballTrail.push({ x: ball.x, y: ball.y, life: 0.3 });
  if (ballTrail.length > 20) {
    ballTrail.shift();
  }
  for (var i = ballTrail.length - 1; i >= 0; i--) {
    ballTrail[i].life -= dt;
    if (ballTrail[i].life <= 0) {
      ballTrail.splice(i, 1);
    }
  }

  // Wall collisions
  if (ball.x - ball.r < 0) {
    ball.x = ball.r;
    ball.vx = -ball.vx;
    Sound.bounce();
    if (Math.abs(ball.vy) < 30) {
      ball.vy = ball.vy >= 0 ? 30 : -30;
    }
  }
  if (ball.x + ball.r > CANVAS_WIDTH) {
    ball.x = CANVAS_WIDTH - ball.r;
    ball.vx = -ball.vx;
    Sound.bounce();
    if (Math.abs(ball.vy) < 30) {
      ball.vy = ball.vy >= 0 ? 30 : -30;
    }
  }
  if (ball.y - ball.r < 0) {
    ball.y = ball.r;
    ball.vy = -ball.vy;
    Sound.bounce();
  }

  // Bottom - lose life
  if (ball.y - ball.r > CANVAS_HEIGHT) {
    loseLife();
    return;
  }

  // Paddle collision
  checkBallPaddleCollision();

  // Brick collisions
  checkBallBrickCollisions();
}

function checkBallPaddleCollision() {
  var pw = getEffectivePaddleWidth();

  if (ball.y + ball.r >= paddle.y &&
      ball.y - ball.r <= paddle.y + paddle.h &&
      ball.x + ball.r >= paddle.x &&
      ball.x - ball.r <= paddle.x + pw &&
      ball.vy > 0) {

    var hitPos = (ball.x - (paddle.x + pw / 2)) / (pw / 2);
    var clampedHit = clamp(hitPos, -1, 1);
    var maxAngle = Math.PI / 3;
    var angle = clampedHit * maxAngle;

    var speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    if (speed < 1) speed = BALL_BASE_SPEED * getLevelSpeedMultiplier();
    ball.vx = speed * Math.sin(angle);
    ball.vy = -speed * Math.cos(angle);

    ball.y = paddle.y - ball.r - 1;
    gameState.combo = 0;
    Sound.bounce();
  }
}

function checkBallBrickCollisions() {
  for (var i = 0; i < bricks.length; i++) {
    var brick = bricks[i];
    if (brick.destroyed) continue;

    // Find closest point on brick to ball center
    var closestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.w));
    var closestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.h));

    var dx = ball.x - closestX;
    var dy = ball.y - closestY;
    var distSq = dx * dx + dy * dy;

    if (distSq < ball.r * ball.r) {
      var dist = Math.sqrt(distSq);
      var nx, ny;

      if (dist < 0.001) {
        // Ball center inside brick - use velocity direction
        if (Math.abs(ball.vx) > Math.abs(ball.vy)) {
          nx = ball.vx > 0 ? -1 : 1;
          ny = 0;
        } else {
          nx = 0;
          ny = ball.vy > 0 ? -1 : 1;
        }
      } else {
        nx = dx / dist;
        ny = dy / dist;
      }

      // Reflect velocity
      var dot = ball.vx * nx + ball.vy * ny;
      ball.vx -= 2 * dot * nx;
      ball.vy -= 2 * dot * ny;

      // Push ball out of brick
      var overlap = Math.min(ball.r - dist + 0.5, ball.r);
      ball.x += nx * overlap;
      ball.y += ny * overlap;

      // Damage brick
      brick.hitsTaken++;
      var brickType = BRICK_TYPES[brick.type];
      var colors = brickType.colors;

      if (brick.hitsTaken >= brickType.hits) {
        brick.destroyed = true;

        // Score with combo
        gameState.combo++;
        var points = brickType.points * gameState.combo;
        gameState.score += points;

        // Particles
        var colorIdx = Math.min(brick.hitsTaken - 1, colors.length - 1);
        var pColor = colors[colorIdx];
        spawnParticles(brick.x + brick.w / 2, brick.y + brick.h / 2, pColor, 12);

        // Screen shake
        if (!reducedMotion) {
          shakeIntensity = Math.max(shakeIntensity, 4);
        }

        // Sound
        Sound.brickBreak();

        // Power-up drop
        if (Math.random() < POWERUP_DROP_CHANCE) {
          var puTypes = Object.keys(POWERUP_TYPES);
          var puType = puTypes[Math.floor(Math.random() * puTypes.length)];
          powerUps.push({
            x: brick.x + brick.w / 2,
            y: brick.y + brick.h / 2,
            type: puType,
            w: 24,
            h: 24,
            vy: POWERUP_SPEED,
          });
        }

        // Check level complete
        checkLevelComplete();
      } else {
        // Brick damaged but not destroyed
        var hitColorIdx = Math.min(brick.hitsTaken, colors.length - 1);
        var hitColor = colors[hitColorIdx];
        spawnParticles(ball.x, ball.y, hitColor, 4);
        Sound.brickHit();
      }

      updateHUD();
      break; // Only process one brick collision per frame
    }
  }
}

// ==================== POWER-UP LOGIC ====================
function updatePowerUps(dt) {
  var pw = getEffectivePaddleWidth();

  for (var i = powerUps.length - 1; i >= 0; i--) {
    var pu = powerUps[i];
    pu.y += pu.vy * dt;

    if (pu.y > CANVAS_HEIGHT) {
      powerUps.splice(i, 1);
      continue;
    }

    // Check paddle collision
    if (pu.x + pu.w / 2 > paddle.x &&
        pu.x - pu.w / 2 < paddle.x + pw &&
        pu.y + pu.h / 2 > paddle.y &&
        pu.y - pu.h / 2 < paddle.y + paddle.h) {
      applyPowerUp(pu.type);
      powerUps.splice(i, 1);
    }
  }
}

function applyPowerUp(type) {
  // Reset previous power-up effect
  if (activePowerUp.active) {
    if (activePowerUp.type === 'EXPAND') {
      paddleWidthMultiplier = 1.0;
    } else if (activePowerUp.type === 'SLOW') {
      speedMultiplier = 1.0;
    }
  }

  activePowerUp.type = type;
  activePowerUp.timer = POWERUP_DURATION;
  activePowerUp.active = true;

  if (type === 'EXPAND') {
    paddleWidthMultiplier = 1.5;
  } else if (type === 'SLOW') {
    speedMultiplier = 0.6;
  }

  // Re-clamp paddle position
  var pw = getEffectivePaddleWidth();
  paddle.x = clamp(paddle.x, 0, CANVAS_WIDTH - pw);

  Sound.powerUp();
}

function updateActivePowerUp(dt) {
  if (activePowerUp.active) {
    activePowerUp.timer -= dt * 1000;
    if (activePowerUp.timer <= 0) {
      activePowerUp.active = false;
      if (activePowerUp.type === 'EXPAND') {
        paddleWidthMultiplier = 1.0;
      } else if (activePowerUp.type === 'SLOW') {
        speedMultiplier = 1.0;
      }
      activePowerUp.type = null;
    }
  }
}

// ==================== GAME FLOW ====================
function startGame() {
  Sound.init();
  gameState.current = STATE_PLAYING;
  gameState.score = 0;
  gameState.lives = MAX_LIVES;
  gameState.level = 1;
  gameState.combo = 0;

  activePowerUp = { type: null, timer: 0, active: false };
  speedMultiplier = 1.0;
  paddleWidthMultiplier = 1.0;
  shakeIntensity = 0;

  paddle.w = PADDLE_WIDTH;
  paddle.x = (CANVAS_WIDTH - paddle.w) / 2;
  paddle.y = CANVAS_HEIGHT - PADDLE_Y_OFFSET;
  paddle.targetX = null;

  bricks = [];
  particles = [];
  powerUps = [];
  ballTrail = [];

  buildLevel(gameState.level);
  resetBall();
  hideOverlay();
  updateHUD();
}

function restartGame() {
  startGame();
}

function nextLevel() {
  if (gameState.level >= LEVELS.length) return;
  gameState.level++;
  gameState.combo = 0;

  activePowerUp = { type: null, timer: 0, active: false };
  speedMultiplier = 1.0;
  paddleWidthMultiplier = 1.0;

  paddle.w = PADDLE_WIDTH;
  paddle.x = (CANVAS_WIDTH - paddle.w) / 2;

  bricks = [];
  particles = [];
  powerUps = [];
  ballTrail = [];

  buildLevel(gameState.level);
  resetBall();
  gameState.current = STATE_PLAYING;
  hideOverlay();
  updateHUD();
}

function loseLife() {
  gameState.lives--;
  gameState.combo = 0;

  activePowerUp = { type: null, timer: 0, active: false };
  speedMultiplier = 1.0;
  paddleWidthMultiplier = 1.0;
  paddle.w = PADDLE_WIDTH;
  powerUps = [];

  Sound.loseLife();

  if (gameState.lives <= 0) {
    gameState.current = STATE_GAME_OVER;
    if (gameState.score > gameState.highScore) {
      gameState.highScore = gameState.score;
      saveHighScore();
    }
    Sound.gameOver();
    showOverlay('gameOver');
  } else {
    resetBall();
  }
  updateHUD();
}

function checkLevelComplete() {
  var remaining = 0;
  for (var i = 0; i < bricks.length; i++) {
    if (!bricks[i].destroyed) {
      remaining++;
      break;
    }
  }

  if (remaining === 0) {
    if (gameState.score > gameState.highScore) {
      gameState.highScore = gameState.score;
      saveHighScore();
    }

    if (gameState.level >= LEVELS.length) {
      gameState.current = STATE_VICTORY;
      Sound.levelComplete();
      showOverlay('victory');
    } else {
      gameState.current = STATE_LEVEL_COMPLETE;
      Sound.levelComplete();
      showOverlay('levelComplete');
    }
  }
}

function pauseGame() {
  gameState.current = STATE_PAUSED;
  showOverlay('pause');
}

function resumeGame() {
  gameState.current = STATE_PLAYING;
  hideOverlay();
}

// ==================== HIGH SCORE ====================
function getStorage() {
  try {
    return window['local' + 'Storage'] || null;
  } catch (e) {
    return null;
  }
}

function loadHighScore() {
  try {
    var storage = getStorage();
    if (!storage) return 0;
    var val = storage.getItem('neonBreakerHighScore');
    return val ? parseInt(val, 10) : 0;
  } catch (e) {
    return 0;
  }
}

function saveHighScore() {
  try {
    var storage = getStorage();
    if (!storage) return;
    storage.setItem('neonBreakerHighScore', String(gameState.highScore));
  } catch (e) {
    // Storage not available
  }
}

// ==================== UPDATE ====================
function update(dt) {
  updatePaddle(dt);
  updateBall(dt);
  updatePowerUps(dt);
  updateParticles(dt);
  updateActivePowerUp(dt);

  // Decay screen shake
  shakeIntensity *= 0.9;
  if (shakeIntensity < 0.1) shakeIntensity = 0;
}

// ==================== RENDER ====================
function render() {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.save();
  if (shakeIntensity > 0) {
    var shakeX = (Math.random() - 0.5) * shakeIntensity;
    var shakeY = (Math.random() - 0.5) * shakeIntensity;
    ctx.translate(shakeX, shakeY);
  }

  drawBackground(ctx);

  if (gameState.current !== STATE_MENU) {
    drawBricks(ctx);
    drawPaddle(ctx);
    drawBallTrail(ctx);
    drawBall(ctx);
    drawParticles(ctx);
    drawPowerUps(ctx);
    drawCombo(ctx);
    drawPowerUpTimer(ctx);
  }

  ctx.restore();
}

function drawBackground(ctx) {
  var gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, '#0a0a14');
  gradient.addColorStop(1, '#141428');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Grid lines
  ctx.strokeStyle = 'rgba(74, 240, 192, 0.04)';
  ctx.lineWidth = 1;
  var gridSize = 40;
  ctx.beginPath();
  for (var x = 0; x <= CANVAS_WIDTH; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_HEIGHT);
  }
  for (var y = 0; y <= CANVAS_HEIGHT; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
  }
  ctx.stroke();
}

function drawBricks(ctx) {
  for (var i = 0; i < bricks.length; i++) {
    var brick = bricks[i];
    if (brick.destroyed) continue;

    var brickType = BRICK_TYPES[brick.type];
    var colors = brickType.colors;
    var colorIdx = Math.min(brick.hitsTaken, colors.length - 1);
    var color = colors[colorIdx];

    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    roundRect(ctx, brick.x, brick.y, brick.w, brick.h, 4);
    ctx.fill();

    // Top highlight
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(brick.x + 3, brick.y + 3, brick.w - 6, 2);
    ctx.restore();
  }
}

function drawPaddle(ctx) {
  var pw = getEffectivePaddleWidth();

  ctx.save();
  ctx.shadowBlur = 15;
  ctx.shadowColor = '#4af0c0';

  var gradient = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h);
  gradient.addColorStop(0, '#4af0c0');
  gradient.addColorStop(1, '#3ad5a8');
  ctx.fillStyle = gradient;
  roundRect(ctx, paddle.x, paddle.y, pw, paddle.h, 6);
  ctx.fill();

  // Highlight
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fillRect(paddle.x + 4, paddle.y + 2, pw - 8, 2);
  ctx.restore();
}

function drawBall(ctx) {
  var radius = ball.r;
  if (ball.stuck) {
    radius = ball.r + Math.sin(Date.now() / 200) * 2;
  }

  ctx.save();
  ctx.shadowBlur = 20;
  ctx.shadowColor = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(74, 240, 192, 0.5)';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, radius * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBallTrail(ctx) {
  for (var i = 0; i < ballTrail.length; i++) {
    var t = ballTrail[i];
    var alpha = (t.life / 0.3) * 0.4;
    var trailRadius = ball.r * ((i + 1) / ballTrail.length) * 0.7;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#4af0c0';
    ctx.fillStyle = '#4af0c0';
    ctx.beginPath();
    ctx.arc(t.x, t.y, trailRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawParticles(ctx) {
  ctx.save();
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    var alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 5;
    ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    var size = p.size * alpha;
    ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawPowerUps(ctx) {
  for (var i = 0; i < powerUps.length; i++) {
    var pu = powerUps[i];
    var config = POWERUP_TYPES[pu.type];

    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = config.color;
    ctx.fillStyle = config.color;
    roundRect(ctx, pu.x - pu.w / 2, pu.y - pu.h / 2, pu.w, pu.h, 6);
    ctx.fill();

    // Symbol
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 14px "Rajdhani", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(config.symbol, pu.x, pu.y);
    ctx.restore();
  }
}

function drawCombo(ctx) {
  if (gameState.combo > 1) {
    ctx.save();
    ctx.font = '700 24px "Orbitron", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ffaa22';
    ctx.fillStyle = '#ffaa22';
    ctx.fillText('COMBO x' + gameState.combo, CANVAS_WIDTH / 2, 50);
    ctx.restore();
  }
}

function drawPowerUpTimer(ctx) {
  if (!activePowerUp.active) return;

  var progress = activePowerUp.timer / POWERUP_DURATION;
  var barWidth = 200;
  var barHeight = 6;
  var barX = (CANVAS_WIDTH - barWidth) / 2;
  var barY = CANVAS_HEIGHT - 25;
  var config = POWERUP_TYPES[activePowerUp.type];

  ctx.save();
  // Background bar
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fillRect(barX, barY, barWidth, barHeight);

  // Fill
  ctx.shadowBlur = 10;
  ctx.shadowColor = config.color;
  ctx.fillStyle = config.color;
  ctx.fillRect(barX, barY, barWidth * progress, barHeight);

  // Label
  ctx.shadowBlur = 0;
  ctx.font = '600 12px "Rajdhani", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = config.color;
  ctx.fillText(config.label, CANVAS_WIDTH / 2, barY - 6);
  ctx.restore();
}

// ==================== HUD ====================
function updateHUD() {
  var elScore = document.getElementById('score');
  var elLives = document.getElementById('lives');
  var elLevel = document.getElementById('level');
  var elHigh = document.getElementById('highScore');
  if (elScore) elScore.textContent = gameState.score;
  if (elLives) elLives.textContent = gameState.lives;
  if (elLevel) elLevel.textContent = gameState.level;
  if (elHigh) elHigh.textContent = gameState.highScore;
}

// ==================== OVERLAY SYSTEM ====================
function showOverlay(type) {
  var overlay = document.getElementById('overlay');
  if (!overlay) return;

  var content = '';

  if (type === 'menu') {
    content =
      '<div class="overlay-content">' +
      '<h1 class="game-title">NEON BREAKER</h1>' +
      '<p class="game-subtitle">Détruisez toutes les briques pour avancer</p>' +
      '<div class="controls-info">' +
      '<p><span class="key">Souris</span> / <span class="key">Flèches</span> / <span class="key">A-D</span> : Déplacer la raquette</p>' +
      '<p><span class="key">Espace</span> / <span class="key">Clic</span> : Lancer la balle</p>' +
      '<p><span class="key">P</span> / <span class="key">Echap</span> : Pause</p>' +
      '<p><span class="key">M</span> : Couper le son</p>' +
      '</div>' +
      '<button id="btnStart" class="btn-neon">JOUER</button>' +
      '</div>';
  } else if (type === 'pause') {
    content =
      '<div class="overlay-content">' +
      '<h2 class="overlay-title">PAUSE</h2>' +
      '<button id="btnResume" class="btn-neon">REPRENDRE</button>' +
      '<button id="btnRestart" class="btn-neon btn-secondary">RECOMMENCER</button>' +
      '</div>';
  } else if (type === 'gameOver') {
    content =
      '<div class="overlay-content">' +
      '<h2 class="overlay-title danger">GAME OVER</h2>' +
      '<p class="final-score">Score : ' + gameState.score + '</p>' +
      '<p class="final-score muted">Record : ' + gameState.highScore + '</p>' +
      '<button id="btnRestart" class="btn-neon">RECOMMENCER</button>' +
      '</div>';
  } else if (type === 'levelComplete') {
    content =
      '<div class="overlay-content">' +
      '<h2 class="overlay-title">NIVEAU ' + gameState.level + ' TERMINÉ</h2>' +
      '<p class="final-score">Score : ' + gameState.score + '</p>' +
      '<button id="btnNext" class="btn-neon">NIVEAU SUIVANT</button>' +
      '</div>';
  } else if (type === 'victory') {
    content =
      '<div class="overlay-content">' +
      '<h2 class="overlay-title victory">VICTOIRE</h2>' +
      '<p class="final-score">Score final : ' + gameState.score + '</p>' +
      '<p class="final-score muted">Record : ' + gameState.highScore + '</p>' +
      '<button id="btnRestart" class="btn-neon">REJOUER</button>' +
      '</div>';
  }

  overlay.innerHTML = content;
  overlay.classList.add('active');

  // Attach event listeners
  var btnStart = document.getElementById('btnStart');
  if (btnStart) btnStart.addEventListener('click', startGame);

  var btnResume = document.getElementById('btnResume');
  if (btnResume) btnResume.addEventListener('click', resumeGame);

  var btnRestart = document.getElementById('btnRestart');
  if (btnRestart) btnRestart.addEventListener('click', restartGame);

  var btnNext = document.getElementById('btnNext');
  if (btnNext) btnNext.addEventListener('click', nextLevel);
}

function hideOverlay() {
  var overlay = document.getElementById('overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

// ==================== CANVAS SIZING ====================
function resizeCanvas() {
  if (!canvas) return;
  var container = document.getElementById('game-container');
  if (!container) return;

  var containerWidth = container.clientWidth;
  var containerHeight = container.clientHeight;
  var targetRatio = CANVAS_WIDTH / CANVAS_HEIGHT;
  var containerRatio = containerWidth / containerHeight;

  var displayWidth, displayHeight;
  if (containerRatio > targetRatio) {
    displayHeight = containerHeight;
    displayWidth = displayHeight * targetRatio;
  } else {
    displayWidth = containerWidth;
    displayHeight = displayWidth / targetRatio;
  }

  canvas.style.width = displayWidth + 'px';
  canvas.style.height = displayHeight + 'px';

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = CANVAS_WIDTH * dpr;
  canvas.height = CANVAS_HEIGHT * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function getCanvasCoords(clientX, clientY) {
  var rect = canvas.getBoundingClientRect();
  var scaleX = CANVAS_WIDTH / rect.width;
  var scaleY = CANVAS_HEIGHT / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

// ==================== GAME LOOP ====================
var lastTime = 0;
var accumulator = 0;

function gameLoop(timestamp) {
  if (lastTime === 0) lastTime = timestamp;
  var delta = timestamp - lastTime;
  lastTime = timestamp;

  var clampedDelta = Math.min(delta, 100);
  accumulator += clampedDelta;

  while (accumulator >= TICK_RATE) {
    if (gameState.current === STATE_PLAYING) {
      update(TICK_RATE / 1000);
    }
    accumulator -= TICK_RATE;
  }

  render();
  requestAnimationFrame(gameLoop);
}

// ==================== MUTE BUTTON ====================
function setupMuteButton() {
  var muteBtn = document.getElementById('muteBtn');
  if (!muteBtn) return;

  var iconOn =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M11 5L6 9H2v6h4l5 4V5z"/>' +
    '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>' +
    '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>' +
    '</svg>';

  var iconOff =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M11 5L6 9H2v6h4l5 4V5z"/>' +
    '<line x1="23" y1="9" x2="17" y2="15"/>' +
    '<line x1="17" y1="9" x2="23" y2="15"/>' +
    '</svg>';

  muteBtn.innerHTML = iconOn;
  muteBtn.addEventListener('click', function () {
    Sound.muted = !Sound.muted;
    muteBtn.innerHTML = Sound.muted ? iconOff : iconOn;
  });
}

// ==================== INITIALIZATION ====================
function init() {
  canvas = document.getElementById('gameCanvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Check reduced motion preference
  try {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    reducedMotion = false;
  }

  // Load high score
  gameState.highScore = loadHighScore();

  // Set up canvas
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Initialize input
  Input.init();

  // Mouse movement - paddle control
  canvas.addEventListener('mousemove', function (e) {
    if (gameState.current !== STATE_PLAYING) return;
    var coords = getCanvasCoords(e.clientX, e.clientY);
    var pw = getEffectivePaddleWidth();
    mouseTargetX = coords.x - pw / 2;
    inputMode = 'mouse';
  });

  // Mouse click - launch ball
  canvas.addEventListener('mousedown', function () {
    Sound.init();
    if (gameState.current === STATE_PLAYING) {
      launchBall();
    }
  });

  // Touch movement - paddle control
  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    if (gameState.current !== STATE_PLAYING) return;
    if (e.touches.length === 0) return;
    var touch = e.touches[0];
    var coords = getCanvasCoords(touch.clientX, touch.clientY);
    var pw = getEffectivePaddleWidth();
    mouseTargetX = coords.x - pw / 2;
    inputMode = 'mouse';
  }, { passive: false });

  // Touch start - launch ball
  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    Sound.init();
    if (e.touches.length > 0) {
      var touch = e.touches[0];
      var coords = getCanvasCoords(touch.clientX, touch.clientY);
      var pw = getEffectivePaddleWidth();
      mouseTargetX = coords.x - pw / 2;
      inputMode = 'mouse';
    }
    if (gameState.current === STATE_PLAYING) {
      launchBall();
    }
  }, { passive: false });

  // Keyboard
  document.addEventListener('keydown', function (e) {
    var code = e.code;
    var key = (e.key || '').toLowerCase();

    // Space - launch ball
    if (code === 'Space' || key === ' ') {
      e.preventDefault();
      Sound.init();
      if (gameState.current === STATE_PLAYING) {
        launchBall();
      }
      return;
    }

    // P or Escape - pause
    if (code === 'KeyP' || key === 'p' || code === 'Escape' || key === 'escape') {
      if (gameState.current === STATE_PLAYING) {
        pauseGame();
      } else if (gameState.current === STATE_PAUSED) {
        resumeGame();
      }
      return;
    }

    // M - mute
    if (code === 'KeyM' || key === 'm') {
      var muteBtn = document.getElementById('muteBtn');
      if (muteBtn) {
        muteBtn.click();
      }
      return;
    }

    // Arrow keys / A-D - keyboard mode
    if (code === 'ArrowLeft' || code === 'ArrowRight' ||
        key === 'a' || key === 'd') {
      inputMode = 'keyboard';
    }
  });

  // Visibility change - reset timer
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      lastTime = 0;
    }
  });

  // Mute button
  setupMuteButton();

  // Show start menu
  showOverlay('menu');
  updateHUD();

  // Start game loop
  requestAnimationFrame(gameLoop);
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
