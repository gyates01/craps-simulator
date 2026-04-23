import React, { useState, useCallback, useEffect, useRef } from 'react';

const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes winGlow { 0%, 100% { box-shadow: 0 0 5px 2px rgba(34, 197, 94, 0.5); } 50% { box-shadow: 0 0 20px 8px rgba(34, 197, 94, 0.9); } }
  @keyframes chipFloat { 0% { transform: translateY(0) scale(1); opacity: 1; } 50% { transform: translateY(-20px) scale(1.2); } 100% { transform: translateY(-40px) scale(0.8); opacity: 0; } }
  .win-glow { animation: winGlow 0.5s ease-in-out 3; }
  .chip-float { animation: chipFloat 1.5s ease-out forwards; }
  .bet-spot { transition: all 0.15s ease; user-select: none; }
  .bet-spot:hover:not(.disabled) { filter: brightness(1.15); }
  .bet-spot.disabled { opacity: 0.5; cursor: not-allowed; }
  .dragging-chip { position: fixed; pointer-events: none; z-index: 1000; transform: translate(-50%, -50%) scale(1.2); filter: drop-shadow(0 6px 12px rgba(0,0,0,0.5)); }
  .drop-highlight { box-shadow: 0 0 15px 5px rgba(255, 255, 0, 0.6) !important; }
`;
document.head.appendChild(styleSheet);

const DiceCup = ({ dice, isRolling, onSettled }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const diceStateRef = useRef([
    { x: 60, y: 70, vx: 0, vy: 0, rotation: 0, vr: 0, value: dice[0] || 1, locked: false },
    { x: 90, y: 90, vx: 0, vy: 0, rotation: 45, vr: 0, value: dice[1] || 1, locked: false }
  ]);
  const lastRollingRef = useRef(false);
  const hasSettledRef = useRef(false);
  
  const CUP_RADIUS = 60, CUP_CENTER = 70, DICE_SIZE = 22, FRICTION = 0.985, BOUNCE = 0.8, DICE_RADIUS = DICE_SIZE * 0.7;
  
  const dotPatterns = {
    1: [[0.5, 0.5]], 2: [[0.28, 0.28], [0.72, 0.72]], 3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
    5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
    6: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.5], [0.72, 0.5], [0.28, 0.72], [0.72, 0.72]],
  };
  
  const drawDie = (ctx, die, settled) => {
    ctx.save();
    ctx.translate(die.x, die.y);
    ctx.rotate(die.rotation * Math.PI / 180);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.roundRect(-DICE_SIZE/2 + 2, -DICE_SIZE/2 + 2, DICE_SIZE, DICE_SIZE, 4); ctx.fill();
    const gradient = ctx.createLinearGradient(-DICE_SIZE/2, -DICE_SIZE/2, DICE_SIZE/2, DICE_SIZE/2);
    gradient.addColorStop(0, '#ff2222'); gradient.addColorStop(0.5, '#cc0000'); gradient.addColorStop(1, '#880000');
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.roundRect(-DICE_SIZE/2, -DICE_SIZE/2, DICE_SIZE, DICE_SIZE, 4); ctx.fill();
    ctx.strokeStyle = '#550000'; ctx.lineWidth = 1; ctx.stroke();
    const speed = Math.sqrt(die.vx * die.vx + die.vy * die.vy);
    const rotSpeed = Math.abs(die.vr);
    if ((settled || (speed < 1.5 && rotSpeed < 4)) && die.value) {
      ctx.fillStyle = '#ffffff';
      (dotPatterns[die.value] || []).forEach(([dx, dy]) => {
        ctx.beginPath(); ctx.arc(-DICE_SIZE/2 + dx * DICE_SIZE, -DICE_SIZE/2 + dy * DICE_SIZE, DICE_SIZE * 0.09, 0, Math.PI * 2); ctx.fill();
      });
    }
    ctx.restore();
  };
  
  const drawCup = (ctx) => {
    ctx.beginPath(); ctx.arc(CUP_CENTER + 2, CUP_CENTER + 2, CUP_RADIUS + 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
    const rim = ctx.createRadialGradient(CUP_CENTER - 15, CUP_CENTER - 15, 0, CUP_CENTER, CUP_CENTER, CUP_RADIUS + 5);
    rim.addColorStop(0, '#8B5A2B'); rim.addColorStop(0.5, '#6B4423'); rim.addColorStop(1, '#4a2f17');
    ctx.beginPath(); ctx.arc(CUP_CENTER, CUP_CENTER, CUP_RADIUS + 5, 0, Math.PI * 2); ctx.fillStyle = rim; ctx.fill();
    const felt = ctx.createRadialGradient(CUP_CENTER - 10, CUP_CENTER - 10, 0, CUP_CENTER, CUP_CENTER, CUP_RADIUS);
    felt.addColorStop(0, '#1a5c32'); felt.addColorStop(0.8, '#145228'); felt.addColorStop(1, '#0f4020');
    ctx.beginPath(); ctx.arc(CUP_CENTER, CUP_CENTER, CUP_RADIUS, 0, Math.PI * 2); ctx.fillStyle = felt; ctx.fill();
  };
  
  useEffect(() => {
    if (isRolling && !lastRollingRef.current) {
      hasSettledRef.current = false;
      diceStateRef.current = [0, 1].map((i) => ({
        x: CUP_CENTER + (Math.random() - 0.5) * 20, y: CUP_CENTER + (Math.random() - 0.5) * 20,
        vx: Math.cos(Math.random() * Math.PI * 2) * (12 + Math.random() * 6),
        vy: Math.sin(Math.random() * Math.PI * 2) * (12 + Math.random() * 6),
        rotation: Math.random() * 360, vr: (Math.random() - 0.5) * 30,
        value: Math.floor(Math.random() * 6) + 1, locked: false, finalValue: dice[i]
      }));
    }
    lastRollingRef.current = isRolling;
  }, [isRolling, dice]);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const animate = () => {
      ctx.clearRect(0, 0, CUP_CENTER * 2, CUP_CENTER * 2);
      drawCup(ctx);
      let allSettled = true;
      
      diceStateRef.current.forEach((die) => {
        const speed = Math.sqrt(die.vx * die.vx + die.vy * die.vy);
        const rotSpeed = Math.abs(die.vr);
        if (speed > 0.15 || rotSpeed > 0.15) {
          allSettled = false;
          die.x += die.vx; die.y += die.vy; die.rotation += die.vr;
          die.vx *= FRICTION; die.vy *= FRICTION; die.vr *= FRICTION;
          if (!die.locked && rotSpeed > 6) die.value = Math.floor(Math.random() * 6) + 1;
          if (!die.locked && rotSpeed < 3 && rotSpeed > 0.15) { die.value = die.finalValue; die.locked = true; }
          const dx = die.x - CUP_CENTER, dy = die.y - CUP_CENTER, dist = Math.sqrt(dx*dx + dy*dy);
          if (dist > CUP_RADIUS - DICE_RADIUS) {
            const nx = dx/dist, ny = dy/dist;
            die.x = CUP_CENTER + nx * (CUP_RADIUS - DICE_RADIUS);
            die.y = CUP_CENTER + ny * (CUP_RADIUS - DICE_RADIUS);
            const dot = die.vx * nx + die.vy * ny;
            die.vx = (die.vx - 2 * dot * nx) * BOUNCE;
            die.vy = (die.vy - 2 * dot * ny) * BOUNCE;
            die.vr += (die.vx * (-ny) + die.vy * nx) * 0.6;
          }
          if (speed < 0.15 && rotSpeed < 0.15) { die.vx = 0; die.vy = 0; die.vr = 0; if (!die.locked) { die.value = die.finalValue; die.locked = true; } }
        } else {
          die.rotation = Math.round(die.rotation / 90) * 90;
          if (!die.locked) { die.value = die.finalValue; die.locked = true; }
        }
      });
      
      const [d1, d2] = diceStateRef.current;
      const ddx = d2.x - d1.x, ddy = d2.y - d1.y, ddist = Math.sqrt(ddx*ddx + ddy*ddy);
      if (ddist < DICE_RADIUS * 2 && ddist > 0) {
        const nx = ddx/ddist, ny = ddy/ddist, overlap = DICE_RADIUS * 2 - ddist;
        d1.x -= nx * overlap / 2; d1.y -= ny * overlap / 2;
        d2.x += nx * overlap / 2; d2.y += ny * overlap / 2;
        const dvn = (d1.vx - d2.vx) * nx + (d1.vy - d2.vy) * ny;
        if (dvn > 0) {
          d1.vx -= dvn * nx * BOUNCE; d1.vy -= dvn * ny * BOUNCE;
          d2.vx += dvn * nx * BOUNCE; d2.vy += dvn * ny * BOUNCE;
        }
      }
      
      [...diceStateRef.current].sort((a, b) => a.y - b.y).forEach(die => drawDie(ctx, die, die.locked));
      
      if (allSettled && !hasSettledRef.current) {
        hasSettledRef.current = true;
        if (onSettled) onSettled([diceStateRef.current[0].value, diceStateRef.current[1].value]);
      }
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [isRolling, dice, onSettled]);
  
  return <canvas ref={canvasRef} width={CUP_CENTER * 2} height={CUP_CENTER * 2} className="rounded-full" style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }} />;
};

const chipColors = {
  1: { bg: '#e5e5e5', border: '#999', text: '#333' },
  5: { bg: '#dc2626', border: '#991b1b', text: '#fff' },
  10: { bg: '#2563eb', border: '#1d4ed8', text: '#fff' },
  25: { bg: '#16a34a', border: '#15803d', text: '#fff' },
  50: { bg: '#ea580c', border: '#c2410c', text: '#fff' },
  100: { bg: '#1f2937', border: '#4b5563', text: '#fff' },
};

const getChipColor = (val) => {
  if (val >= 100) return chipColors[100];
  if (val >= 50) return chipColors[50];
  if (val >= 25) return chipColors[25];
  if (val >= 10) return chipColors[10];
  if (val >= 5) return chipColors[5];
  return chipColors[1];
};

const Chip = ({ value, size = 44, selected = false, onClick, draggable = false, onDragStart }) => {
  const colors = chipColors[value] || getChipColor(value);
  return (
    <div onClick={onClick} draggable={draggable}
      onDragStart={(e) => { if (onDragStart) { e.dataTransfer.setData('chipValue', value.toString()); onDragStart(value, e); } }}
      className={`rounded-full font-bold flex items-center justify-center cursor-pointer select-none ${selected ? 'ring-4 ring-yellow-400 scale-110' : 'hover:scale-105'} transition-transform`}
      style={{ width: size, height: size, backgroundColor: colors.bg, border: `3px solid ${colors.border}`, color: colors.text, fontSize: size * 0.28,
        boxShadow: selected ? '0 0 12px rgba(250, 204, 21, 0.8), inset 0 2px 4px rgba(255,255,255,0.3)' : 'inset 0 2px 4px rgba(255,255,255,0.3), 0 3px 6px rgba(0,0,0,0.3)' }}>
      ${value}
    </div>
  );
};

const BetChip = ({ amount }) => {
  if (!amount) return null;
  const colors = getChipColor(amount);
  return (
    <div className="rounded-full font-bold flex items-center justify-center shadow-lg"
      style={{ width: 30, height: 30, backgroundColor: colors.bg, border: `2px solid ${colors.border}`, color: colors.text, fontSize: 9,
        boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.4)' }}>
      ${amount}
    </div>
  );
};

const FloatingWin = ({ amount }) => {
  if (!amount) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
      <div className="chip-float bg-green-500 text-white px-2 py-1 rounded-full font-bold text-sm shadow-lg border-2 border-green-300">+${Math.floor(amount)}</div>
    </div>
  );
};

const Puck = ({ isOn, size = 'md' }) => {
  const sizes = { sm: 'w-8 h-5 text-xs', md: 'w-10 h-6 text-xs', lg: 'w-12 h-7 text-sm' };
  return (
    <div className={`${sizes[size]} rounded-full font-bold flex items-center justify-center border-2 ${isOn ? 'bg-white text-black border-gray-300' : 'bg-gray-900 text-white border-gray-600'}`}
      style={{ boxShadow: isOn ? '0 0 8px rgba(255,255,255,0.8)' : '0 2px 4px rgba(0,0,0,0.3)' }}>
      {isOn ? 'ON' : 'OFF'}
    </div>
  );
};

const MINIMUM_BET = 3;
const buyInAmounts = [50, 100, 200, 500, 1000];
const standardChips = [1, 5, 10, 25, 50, 100];
const PAYOUTS = {
  pass: 1, dontPass: 1, come: 1, dontCome: 1,
  field: { default: 1, two: 2, twelve: 2 },
  place: { 4: 9/5, 5: 7/5, 6: 7/6, 8: 7/6, 9: 7/5, 10: 9/5 },
  buy: { 4: 2, 5: 3/2, 6: 6/5, 8: 6/5, 9: 3/2, 10: 2 },
  hardways: { 4: 7, 6: 9, 8: 9, 10: 7 },
  passOdds: { 4: 2, 5: 3/2, 6: 6/5, 8: 6/5, 9: 3/2, 10: 2 },
  dontPassOdds: { 4: 1/2, 5: 2/3, 6: 5/6, 8: 5/6, 9: 2/3, 10: 1/2 },
  anySeven: 4, anyCraps: 7, craps2: 30, craps3: 15, craps12: 30, eleven: 15,
};

const CrapsGame = () => {
  const [gameStarted, setGameStarted] = useState(false);
  const [startingBankroll, setStartingBankroll] = useState(100);
  const [bankroll, setBankroll] = useState(100);
  const [currentBet, setCurrentBet] = useState(5);
  const [dice, setDice] = useState([null, null]);
  const [point, setPoint] = useState(null);
  const [phase, setPhase] = useState('comeOut');
  const [message, setMessage] = useState('Place your bets!');
  const [isRolling, setIsRolling] = useState(false);
  const [lastWin, setLastWin] = useState(0);
  const [winningSpaces, setWinningSpaces] = useState([]);
  const [animatingWins, setAnimatingWins] = useState({});
  const [rollHistory, setRollHistory] = useState([]);
  const [showPayouts, setShowPayouts] = useState(false);
  const [draggingChip, setDraggingChip] = useState(null);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [dropTarget, setDropTarget] = useState(null);
  const [autoRoll, setAutoRoll] = useState(false);
  const [autoRollDelay, setAutoRollDelay] = useState(3);
  const [autoRollCountdown, setAutoRollCountdown] = useState(0);
  const [hardwaysSince, setHardwaysSince] = useState({ hard4: 0, hard6: 0, hard8: 0, hard10: 0 });
  
  const [bets, setBets] = useState({
    pass: 0, dontPass: 0, passOdds: 0, dontPassOdds: 0, come: 0, dontCome: 0, field: 0, big6: 0, big8: 0,
    place4: 0, place5: 0, place6: 0, place8: 0, place9: 0, place10: 0,
    buy4: 0, buy5: 0, buy6: 0, buy8: 0, buy9: 0, buy10: 0,
    hard4: 0, hard6: 0, hard8: 0, hard10: 0,
    anySeven: 0, anyCraps: 0, craps2: 0, craps3: 0, craps12: 0, eleven: 0, horn: 0, ce: 0,
  });
  const [comeBets, setComeBets] = useState({});
  const [dontComeBets, setDontComeBets] = useState({});
  
  const [sessionStats, setSessionStats] = useState({ totalRolls: 0, totalWon: 0, sevenOuts: 0, pointsHit: 0, naturalWins: 0, crapsLosses: 0 });
  const [allTimeStats, setAllTimeStats] = useState({ byBuyIn: {} });
  const [statsLoaded, setStatsLoaded] = useState(false);
  
  useEffect(() => {
    const load = async () => { try { const r = localStorage.getItem('craps-stats-v4'); if (r) setAllTimeStats(JSON.parse(r)); } catch (e) {} setStatsLoaded(true); };
    load();
  }, []);
  
  useEffect(() => {
    if (statsLoaded) { const save = async () => { try { localStorage.setItem('craps-stats-v4', JSON.stringify(allTimeStats)); } catch (e) {} }; save(); }
  }, [allTimeStats, statsLoaded]);
  
  useEffect(() => {
    if (!autoRoll || isRolling) return;
    setAutoRollCountdown(autoRollDelay);
    const interval = setInterval(() => {
      setAutoRollCountdown(prev => { if (prev <= 1) { handleRoll(); return autoRollDelay; } return prev - 1; });
    }, 1000);
    return () => clearInterval(interval);
  }, [autoRoll, isRolling, autoRollDelay]);

  const handleMouseMove = (e) => { if (draggingChip) setDragPosition({ x: e.clientX, y: e.clientY }); };
  const handleDragStart = (chipValue, e) => { setDraggingChip(chipValue); const img = new Image(); img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; e.dataTransfer.setDragImage(img, 0, 0); };
  const handleDragEnd = () => { setDraggingChip(null); setDropTarget(null); };
  const handleDragOver = (e, betType) => { e.preventDefault(); if (canBet(betType)) setDropTarget(betType); };
  const handleDragLeave = () => setDropTarget(null);
  const handleDrop = (e, betType) => { e.preventDefault(); const val = parseInt(e.dataTransfer.getData('chipValue')) || draggingChip; if (val && canBet(betType)) placeBet(betType, val); setDropTarget(null); setDraggingChip(null); };
  
  const canBet = (betType) => {
    if (phase === 'comeOut') {
      return ['pass', 'dontPass', 'field', 'hard4', 'hard6', 'hard8', 'hard10', 'anySeven', 'anyCraps', 'craps2', 'craps3', 'craps12', 'eleven', 'horn', 'ce', 'big6', 'big8'].includes(betType);
    } else {
      if (betType === 'pass' && bets.pass > 0) return false;
      if (betType === 'dontPass' && bets.dontPass > 0) return false;
      return true;
    }
  };
  
  const placeBet = (betType, amount = currentBet) => {
    if (!canBet(betType)) { setMessage(`Can't bet ${betType} now`); return; }
    if (amount > bankroll) { setMessage("Not enough!"); return; }
    if (betType === 'passOdds') { if (!bets.pass || !point) return; const max = bets.pass * 3; if (bets.passOdds + amount > max) { setMessage(`Max odds: $${max}`); return; } }
    if (betType === 'dontPassOdds') { if (!bets.dontPass || !point) return; const max = bets.dontPass * 3; if (bets.dontPassOdds + amount > max) { setMessage(`Max odds: $${max}`); return; } }
    setBankroll(prev => prev - amount);
    setBets(prev => ({ ...prev, [betType]: prev[betType] + amount }));
  };
  
  const removeBet = (betType) => {
    if (betType === 'pass' && point) { setMessage("Can't remove Pass!"); return; }
    if (bets[betType] > 0) { setBankroll(prev => prev + bets[betType]); setBets(prev => ({ ...prev, [betType]: 0 })); }
  };
  
  const addComeOdds = (num, amt = currentBet) => {
    if (!comeBets[num] || amt > bankroll) return;
    const max = comeBets[num].bet * 3;
    if (comeBets[num].odds + amt > max) return;
    setBankroll(prev => prev - amt);
    setComeBets(prev => ({ ...prev, [num]: { ...prev[num], odds: prev[num].odds + amt } }));
  };
  
  const addDontComeOdds = (num, amt = currentBet) => {
    if (!dontComeBets[num] || amt > bankroll) return;
    const max = dontComeBets[num].bet * 3;
    if (dontComeBets[num].odds + amt > max) return;
    setBankroll(prev => prev - amt);
    setDontComeBets(prev => ({ ...prev, [num]: { ...prev[num], odds: prev[num].odds + amt } }));
  };
  
  const clearBets = () => {
    let ret = 0;
    const cleared = { ...bets };
    Object.keys(cleared).forEach(k => { if (point && ['pass', 'dontPass', 'passOdds', 'dontPassOdds'].includes(k)) return; ret += cleared[k]; cleared[k] = 0; });
    setBankroll(prev => prev + ret);
    setBets(cleared);
  };
  
  const rollDice = () => [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
  
  const totalBetsOnTable = Object.values(bets).reduce((a, b) => a + b, 0) + Object.values(comeBets).reduce((a, cb) => a + cb.bet + cb.odds, 0) + Object.values(dontComeBets).reduce((a, dcb) => a + dcb.bet + dcb.odds, 0);
  const meetsMinimumBet = totalBetsOnTable >= MINIMUM_BET || bets.pass > 0 || bets.dontPass > 0;
  
  const handleRoll = () => {
    if (isRolling || !meetsMinimumBet) return;
    setIsRolling(true); setLastWin(0); setWinningSpaces([]); setAnimatingWins({});
    const finalDice = rollDice();
    setDice(finalDice);
    setTimeout(() => { resolveRoll(finalDice); setIsRolling(false); }, 1200);
  };

  const resolveRoll = (newDice) => {
    const total = newDice[0] + newDice[1];
    const isHard = newDice[0] === newDice[1];
    setRollHistory(prev => [...prev, total].slice(-30));
    
    let winnings = 0, messages = [], winners = [], winAmounts = {}, statsUpdate = { totalRolls: 1 };
    
    setHardwaysSince(prev => {
      const u = { hard4: prev.hard4 + 1, hard6: prev.hard6 + 1, hard8: prev.hard8 + 1, hard10: prev.hard10 + 1 };
      if (isHard) { if (total === 4) u.hard4 = 0; if (total === 6) u.hard6 = 0; if (total === 8) u.hard8 = 0; if (total === 10) u.hard10 = 0; }
      return u;
    });
    
    // Field
    if (bets.field > 0) {
      if (total === 2 || total === 12) { const w = bets.field * 3; winnings += w; winners.push('field'); winAmounts.field = w; messages.push(`Field 2:1!`); }
      else if ([3, 4, 9, 10, 11].includes(total)) { const w = bets.field * 2; winnings += w; winners.push('field'); winAmounts.field = w; messages.push(`Field wins!`); }
      setBets(prev => ({ ...prev, field: 0 }));
    }
    
    // One roll bets
    if (bets.anySeven > 0) { if (total === 7) { const w = bets.anySeven + bets.anySeven * 4; winnings += w; winners.push('anySeven'); winAmounts.anySeven = w; } setBets(prev => ({ ...prev, anySeven: 0 })); }
    if (bets.anyCraps > 0) { if ([2,3,12].includes(total)) { const w = bets.anyCraps + bets.anyCraps * 7; winnings += w; winners.push('anyCraps'); winAmounts.anyCraps = w; } setBets(prev => ({ ...prev, anyCraps: 0 })); }
    if (bets.craps2 > 0) { if (total === 2) { const w = bets.craps2 + bets.craps2 * 30; winnings += w; winners.push('craps2'); winAmounts.craps2 = w; } setBets(prev => ({ ...prev, craps2: 0 })); }
    if (bets.craps3 > 0) { if (total === 3) { const w = bets.craps3 + bets.craps3 * 15; winnings += w; winners.push('craps3'); winAmounts.craps3 = w; } setBets(prev => ({ ...prev, craps3: 0 })); }
    if (bets.craps12 > 0) { if (total === 12) { const w = bets.craps12 + bets.craps12 * 30; winnings += w; winners.push('craps12'); winAmounts.craps12 = w; } setBets(prev => ({ ...prev, craps12: 0 })); }
    if (bets.eleven > 0) { if (total === 11) { const w = bets.eleven + bets.eleven * 15; winnings += w; winners.push('eleven'); winAmounts.eleven = w; } setBets(prev => ({ ...prev, eleven: 0 })); }
    if (bets.horn > 0) { const q = bets.horn / 4; if (total === 2) { winnings += q + q * 30; winners.push('horn'); winAmounts.horn = q * 31; } else if (total === 3 || total === 11) { winnings += q + q * 15; winners.push('horn'); winAmounts.horn = q * 16; } else if (total === 12) { winnings += q + q * 30; winners.push('horn'); winAmounts.horn = q * 31; } setBets(prev => ({ ...prev, horn: 0 })); }
    if (bets.ce > 0) { const h = bets.ce / 2; if ([2,3,12].includes(total)) { winnings += h + h * 3; winners.push('ce'); winAmounts.ce = h * 4; } else if (total === 11) { winnings += h + h * 7; winners.push('ce'); winAmounts.ce = h * 8; } setBets(prev => ({ ...prev, ce: 0 })); }
    
    // Big 6/8
    if (bets.big6 > 0) { if (total === 6) { winnings += bets.big6 * 2; winners.push('big6'); winAmounts.big6 = bets.big6 * 2; setBets(prev => ({ ...prev, big6: 0 })); } else if (total === 7) { setBets(prev => ({ ...prev, big6: 0 })); } }
    if (bets.big8 > 0) { if (total === 8) { winnings += bets.big8 * 2; winners.push('big8'); winAmounts.big8 = bets.big8 * 2; setBets(prev => ({ ...prev, big8: 0 })); } else if (total === 7) { setBets(prev => ({ ...prev, big8: 0 })); } }
    
    // Hardways
    if (isHard && [4, 6, 8, 10].includes(total)) {
      const k = `hard${total}`;
      if (bets[k] > 0) { const w = bets[k] + bets[k] * PAYOUTS.hardways[total]; winnings += w; winners.push(k); winAmounts[k] = w; messages.push(`Hard ${total}!`); setBets(prev => ({ ...prev, [k]: 0 })); }
    } else {
      [4, 6, 8, 10].forEach(n => { const k = `hard${n}`; if (bets[k] > 0 && (total === n || total === 7)) setBets(prev => ({ ...prev, [k]: 0 })); });
    }
    
    // Place bets (off during come-out)
    if (phase === 'point') {
      [4, 5, 6, 8, 9, 10].forEach(n => {
        const k = `place${n}`;
        if (bets[k] > 0) {
          if (total === n) { const p = Math.floor(bets[k] * PAYOUTS.place[n]); const w = bets[k] + p; winnings += w; winners.push(k); winAmounts[k] = w; setBets(prev => ({ ...prev, [k]: 0 })); }
          else if (total === 7) { setBets(prev => ({ ...prev, [k]: 0 })); }
        }
      });
    }
    
    // Buy bets
    if (phase === 'point') {
      [4, 5, 6, 8, 9, 10].forEach(n => {
        const k = `buy${n}`;
        if (bets[k] > 0) {
          if (total === n) { const p = Math.floor(bets[k] * PAYOUTS.buy[n]); const w = bets[k] + p; winnings += w; winners.push(k); winAmounts[k] = w; setBets(prev => ({ ...prev, [k]: 0 })); }
          else if (total === 7) { setBets(prev => ({ ...prev, [k]: 0 })); }
        }
      });
    }
    
    // Come bets on numbers
    Object.keys(comeBets).forEach(num => {
      const n = parseInt(num);
      if (total === n) { const cb = comeBets[n]; const op = cb.odds * PAYOUTS.passOdds[n]; const w = cb.bet * 2 + cb.odds + op; winnings += w; winners.push(`come${n}`); winAmounts[`come${n}`] = w; setComeBets(prev => { const x = { ...prev }; delete x[n]; return x; }); }
      else if (total === 7) { setComeBets(prev => { const x = { ...prev }; delete x[n]; return x; }); }
    });
    
    // Don't come on numbers
    Object.keys(dontComeBets).forEach(num => {
      const n = parseInt(num);
      if (total === 7) { const dcb = dontComeBets[n]; const op = dcb.odds * PAYOUTS.dontPassOdds[n]; const w = dcb.bet * 2 + dcb.odds + op; winnings += w; winners.push(`dontCome${n}`); winAmounts[`dontCome${n}`] = w; setDontComeBets(prev => { const x = { ...prev }; delete x[n]; return x; }); }
      else if (total === n) { setDontComeBets(prev => { const x = { ...prev }; delete x[n]; return x; }); }
    });
    
    // New come bet
    if (bets.come > 0) {
      if ([7, 11].includes(total)) { winnings += bets.come * 2; winners.push('come'); winAmounts.come = bets.come * 2; setBets(prev => ({ ...prev, come: 0 })); }
      else if ([2, 3, 12].includes(total)) { setBets(prev => ({ ...prev, come: 0 })); }
      else { setComeBets(prev => ({ ...prev, [total]: { bet: (prev[total]?.bet || 0) + bets.come, odds: prev[total]?.odds || 0 } })); messages.push(`Come => ${total}`); setBets(prev => ({ ...prev, come: 0 })); }
    }
    
    // New don't come
    if (bets.dontCome > 0) {
      if ([2, 3].includes(total)) { winnings += bets.dontCome * 2; winners.push('dontCome'); winAmounts.dontCome = bets.dontCome * 2; setBets(prev => ({ ...prev, dontCome: 0 })); }
      else if (total === 12) { winnings += bets.dontCome; setBets(prev => ({ ...prev, dontCome: 0 })); }
      else if ([7, 11].includes(total)) { setBets(prev => ({ ...prev, dontCome: 0 })); }
      else { setDontComeBets(prev => ({ ...prev, [total]: { bet: (prev[total]?.bet || 0) + bets.dontCome, odds: prev[total]?.odds || 0 } })); messages.push(`DC => ${total}`); setBets(prev => ({ ...prev, dontCome: 0 })); }
    }
    
    // Pass line
    if (phase === 'comeOut') {
      if ([7, 11].includes(total)) {
        if (bets.pass > 0) { winnings += bets.pass * 2; winners.push('pass'); winAmounts.pass = bets.pass * 2; messages.push(`Pass wins!`); setBets(prev => ({ ...prev, pass: 0 })); }
        if (bets.dontPass > 0) { setBets(prev => ({ ...prev, dontPass: 0 })); }
        statsUpdate.naturalWins = 1;
      } else if ([2, 3, 12].includes(total)) {
        if (bets.pass > 0) { setBets(prev => ({ ...prev, pass: 0 })); }
        if (bets.dontPass > 0) { if (total === 12) { winnings += bets.dontPass; } else { winnings += bets.dontPass * 2; winners.push('dontPass'); winAmounts.dontPass = bets.dontPass * 2; } setBets(prev => ({ ...prev, dontPass: 0 })); }
        statsUpdate.crapsLosses = 1;
      } else { setPoint(total); setPhase('point'); messages.push(`Point is ${total}`); }
    } else {
      if (total === point) {
        if (bets.pass > 0) { const op = bets.passOdds * PAYOUTS.passOdds[point]; const w = bets.pass * 2 + bets.passOdds + op; winnings += w; winners.push('pass'); if (bets.passOdds > 0) winners.push('passOdds'); winAmounts.pass = w; messages.push(`Point hit!`); setBets(prev => ({ ...prev, pass: 0, passOdds: 0 })); }
        if (bets.dontPass > 0) { setBets(prev => ({ ...prev, dontPass: 0, dontPassOdds: 0 })); }
        statsUpdate.pointsHit = 1; setPoint(null); setPhase('comeOut');
      } else if (total === 7) {
        if (bets.pass > 0) { messages.push(`Seven out!`); setBets(prev => ({ ...prev, pass: 0, passOdds: 0 })); }
        if (bets.dontPass > 0) { const op = bets.dontPassOdds * PAYOUTS.dontPassOdds[point]; const w = bets.dontPass * 2 + bets.dontPassOdds + op; winnings += w; winners.push('dontPass'); winAmounts.dontPass = w; setBets(prev => ({ ...prev, dontPass: 0, dontPassOdds: 0 })); }
        statsUpdate.sevenOuts = 1; setPoint(null); setPhase('comeOut');
      }
    }
    
    winnings = Math.floor(winnings);
    setBankroll(prev => prev + winnings);
    setLastWin(winnings);
    setMessage(messages.length > 0 ? messages.join(' • ') : `Rolled ${total}`);
    setWinningSpaces(winners);
    setAnimatingWins(winAmounts);
    setTimeout(() => { setWinningSpaces([]); setAnimatingWins({}); }, 2000);
    setSessionStats(prev => ({ ...prev, totalRolls: prev.totalRolls + 1, totalWon: prev.totalWon + winnings, sevenOuts: prev.sevenOuts + (statsUpdate.sevenOuts || 0), pointsHit: prev.pointsHit + (statsUpdate.pointsHit || 0), naturalWins: prev.naturalWins + (statsUpdate.naturalWins || 0), crapsLosses: prev.crapsLosses + (statsUpdate.crapsLosses || 0) }));
  };
  
  const startGame = (amt) => { setStartingBankroll(amt); setBankroll(amt); setGameStarted(true); };
  const resetGame = () => {
    setBankroll(startingBankroll);
    setBets({ pass: 0, dontPass: 0, passOdds: 0, dontPassOdds: 0, come: 0, dontCome: 0, field: 0, big6: 0, big8: 0, place4: 0, place5: 0, place6: 0, place8: 0, place9: 0, place10: 0, buy4: 0, buy5: 0, buy6: 0, buy8: 0, buy9: 0, buy10: 0, hard4: 0, hard6: 0, hard8: 0, hard10: 0, anySeven: 0, anyCraps: 0, craps2: 0, craps3: 0, craps12: 0, eleven: 0, horn: 0, ce: 0 });
    setComeBets({}); setDontComeBets({}); setPoint(null); setPhase('comeOut'); setDice([null, null]); setRollHistory([]); setAutoRoll(false);
  };
  const resetAllTimeStats = async () => { setAllTimeStats({ byBuyIn: {} }); try { localStorage.setItem('craps-stats-v4', JSON.stringify({ byBuyIn: {} })); } catch (e) {} setMessage('Stats reset!'); };
  
  if (!gameStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 flex items-center justify-center p-4">
        <div className="bg-green-800 rounded-xl p-8 max-w-md w-full shadow-2xl border border-green-700">
          <h1 className="text-4xl font-bold text-center mb-2 text-yellow-400">🎲 CRAPS 🎲</h1>
          <p className="text-center text-green-300 mb-6">Select buy-in:</p>
          <div className="grid grid-cols-2 gap-3">
            {buyInAmounts.map(amt => (
              <button key={amt} onClick={() => startGame(amt)} className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-4 px-6 rounded-lg text-xl transition-all hover:scale-105 shadow-lg">${amt}</button>
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  const BetSpot = ({ betKey, label, sublabel, className = '', children }) => {
    const isWinning = winningSpaces.includes(betKey);
    const isDropTarget = dropTarget === betKey;
    const disabled = !canBet(betKey);
    return (
      <div onClick={() => !disabled && placeBet(betKey)} onContextMenu={(e) => { e.preventDefault(); removeBet(betKey); }}
        onDragOver={(e) => handleDragOver(e, betKey)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, betKey)}
        className={`bet-spot relative cursor-pointer ${className} ${isWinning ? 'win-glow' : ''} ${isDropTarget ? 'drop-highlight' : ''} ${disabled ? 'disabled' : ''}`}>
        {label && <div className="font-bold">{label}</div>}
        {sublabel && <div className="text-xs opacity-75">{sublabel}</div>}
        {bets[betKey] > 0 && <div className="absolute -top-2 -right-2 z-10"><BetChip amount={bets[betKey]} /></div>}
        {animatingWins[betKey] && <FloatingWin amount={animatingWins[betKey]} />}
        {children}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 text-white select-none" onMouseMove={handleMouseMove} onDragEnd={handleDragEnd}>
      {draggingChip && dragPosition.x > 0 && (
        <div className="dragging-chip" style={{ left: dragPosition.x, top: dragPosition.y }}><Chip value={draggingChip} size={48} /></div>
      )}
      
      {showPayouts && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowPayouts(false)}>
          <div className="bg-green-800 rounded-xl p-4 max-w-2xl w-full max-h-[85vh] overflow-y-auto border border-green-600" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3"><h2 className="text-lg font-bold">Payouts</h2><button onClick={() => setShowPayouts(false)} className="text-2xl hover:text-red-400">&times;</button></div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-green-700/50 rounded p-2"><b className="text-yellow-300">Pass/Come:</b> 7,11 win • 2,3,12 lose • Point wins</div>
              <div className="bg-green-700/50 rounded p-2"><b className="text-yellow-300">Don't Pass/Come:</b> 2,3 win • 12 push • 7,11 lose</div>
              <div className="bg-green-700/50 rounded p-2"><b className="text-yellow-300">Place:</b> 4,10→9:5 • 5,9→7:5 • 6,8→7:6</div>
              <div className="bg-green-700/50 rounded p-2"><b className="text-yellow-300">Hardways:</b> 4,10→7:1 • 6,8→9:1</div>
              <div className="bg-green-700/50 rounded p-2"><b className="text-yellow-300">Field:</b> 3,4,9,10,11→1:1 • 2,12→2:1</div>
              <div className="bg-green-700/50 rounded p-2"><b className="text-yellow-300">One Roll:</b> Any7→4:1 • Craps→7:1 • 2,12→30:1 • 3,11→15:1</div>
            </div>
          </div>
        </div>
      )}
      
      <div className="max-w-5xl mx-auto p-2">
        <div className="flex items-center justify-between mb-2 bg-green-800/30 rounded-lg p-2">
          <div className="flex items-center gap-3">
            <DiceCup dice={dice} isRolling={isRolling} />
            {dice[0] && dice[1] && !isRolling && <div className="text-3xl font-bold text-yellow-400">= {dice[0] + dice[1]}</div>}
          </div>
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2 mb-1">
              <Puck isOn={phase === 'point'} />
              <span className="font-bold">{phase === 'comeOut' ? 'COME OUT' : `POINT: ${point}`}</span>
            </div>
            <div className="text-sm text-center">{message}</div>
            {lastWin > 0 && <div className="text-yellow-400 font-bold text-lg">+${lastWin}</div>}
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-yellow-400">${bankroll}</div>
            <div className="text-xs text-green-300">Min: ${MINIMUM_BET}</div>
            <div className="flex gap-1 mt-1 justify-end">
              <button onClick={() => setShowPayouts(true)} className="bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded text-xs">?</button>
              <button onClick={clearBets} className="bg-red-700 hover:bg-red-600 px-2 py-1 rounded text-xs">Clear</button>
              <button onClick={resetGame} className="bg-gray-600 hover:bg-gray-500 px-2 py-1 rounded text-xs">Reset</button>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2 mb-2">
          <button onClick={handleRoll} disabled={isRolling || !meetsMinimumBet}
            className={`flex-1 py-3 rounded-lg text-xl font-bold transition-all ${isRolling ? 'bg-gray-600 animate-pulse' : !meetsMinimumBet ? 'bg-gray-600' : 'bg-red-600 hover:bg-red-500 hover:scale-[1.02]'}`}>
            {isRolling ? '🎲 Rolling...' : !meetsMinimumBet ? `Min $${MINIMUM_BET}` : '🎲 ROLL DICE'}
          </button>
          <div className="flex flex-col gap-1">
            <button onClick={() => setAutoRoll(!autoRoll)} className={`px-3 py-1 rounded text-xs font-bold ${autoRoll ? 'bg-green-600' : 'bg-gray-600 hover:bg-gray-500'}`}>Auto {autoRoll ? 'ON' : 'OFF'}</button>
            {autoRoll && <div className="text-center text-xs bg-green-700 rounded py-1">{autoRollCountdown}s</div>}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="bg-gradient-to-b from-red-900 to-red-950 rounded-lg p-2 border border-red-800">
            <div className="text-xs font-bold text-center text-yellow-300 mb-1">HARDWAYS <span className="text-gray-400">(rolls since)</span></div>
            <div className="grid grid-cols-2 gap-1">
              {[[4,'7:1'],[6,'9:1'],[8,'9:1'],[10,'7:1']].map(([n,p]) => (
                <BetSpot key={`hard${n}`} betKey={`hard${n}`} className="bg-red-800/80 hover:bg-red-700 p-2 rounded text-center">
                  <div className="text-xs text-gray-300">{p}</div><div className="font-bold">Hard {n}</div><div className="text-xs text-yellow-400">{hardwaysSince[`hard${n}`]}</div>
                </BetSpot>
              ))}
            </div>
          </div>
          <div className="bg-gradient-to-b from-yellow-900 to-yellow-950 rounded-lg p-2 border border-yellow-800">
            <div className="text-xs font-bold text-center text-yellow-300 mb-1">ONE ROLL BETS</div>
            <div className="grid grid-cols-3 gap-1">
              {[['anySeven','7','4:1'],['anyCraps','Craps','7:1'],['craps2','2','30:1'],['craps3','3','15:1'],['eleven','11','15:1'],['craps12','12','30:1']].map(([k,l,p]) => (
                <BetSpot key={k} betKey={k} className="bg-yellow-800/80 hover:bg-yellow-700 p-1 rounded text-center text-xs">
                  <div className="font-bold">{l}</div><div className="text-yellow-300">{p}</div>
                </BetSpot>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1 mt-1">
              <BetSpot betKey="horn" className="bg-yellow-800/80 hover:bg-yellow-700 p-1 rounded text-center text-xs"><div className="font-bold">HORN</div></BetSpot>
              <BetSpot betKey="ce" className="bg-yellow-800/80 hover:bg-yellow-700 p-1 rounded text-center text-xs"><div className="font-bold">C & E</div></BetSpot>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-b from-green-800 to-green-900 rounded-lg p-2 mb-2 border border-green-700">
          <div className="grid grid-cols-6 gap-1">
            {[4,5,6,8,9,10].map(num => {
              const displayNum = num === 6 ? 'SIX' : num === 9 ? 'NINE' : num;
              const isPoint = point === num;
              return (
                <div key={num} className="text-center">
                  <div className="h-6 flex justify-center mb-1">{isPoint && <Puck isOn={true} size="sm" />}</div>
                  <div className={`text-2xl font-bold mb-1 ${isPoint ? 'text-yellow-400' : ''}`}>{displayNum}</div>
                  <div className="grid grid-cols-2 gap-0.5 text-xs">
                    <BetSpot betKey={`place${num}`} className="bg-green-700 hover:bg-green-600 p-1 rounded"><div>PLACE</div></BetSpot>
                    <BetSpot betKey={`buy${num}`} className="bg-blue-700 hover:bg-blue-600 p-1 rounded"><div>BUY</div></BetSpot>
                  </div>
                  {comeBets[num] && (
                    <div onClick={() => addComeOdds(num)} className={`mt-1 bg-yellow-600 rounded p-1 text-xs cursor-pointer hover:bg-yellow-500 ${winningSpaces.includes(`come${num}`) ? 'win-glow' : ''}`}>
                      C ${comeBets[num].bet}{comeBets[num].odds > 0 && <span className="text-yellow-200"> +{comeBets[num].odds}</span>}
                      {animatingWins[`come${num}`] && <FloatingWin amount={animatingWins[`come${num}`]} />}
                    </div>
                  )}
                  {dontComeBets[num] && (
                    <div onClick={() => addDontComeOdds(num)} className={`mt-1 bg-red-600 rounded p-1 text-xs cursor-pointer hover:bg-red-500 ${winningSpaces.includes(`dontCome${num}`) ? 'win-glow' : ''}`}>
                      DC ${dontComeBets[num].bet}{dontComeBets[num].odds > 0 && <span className="text-red-200"> +{dontComeBets[num].odds}</span>}
                      {animatingWins[`dontCome${num}`] && <FloatingWin amount={animatingWins[`dontCome${num}`]} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="bg-gradient-to-b from-green-700 to-green-800 rounded-lg p-2 mb-2 border border-green-600">
          <BetSpot betKey="come" className="w-full bg-green-600 hover:bg-green-500 p-3 rounded-lg text-center text-xl font-bold mb-2">COME</BetSpot>
          <div className="flex gap-2 mb-2">
            <BetSpot betKey="big6" className="w-14 bg-orange-600 hover:bg-orange-500 rounded-lg flex flex-col items-center justify-center p-2">
              <div className="text-xl font-bold">6</div><div className="text-xs">BIG</div>
            </BetSpot>
            <BetSpot betKey="field" className="flex-1 bg-gradient-to-r from-green-600 via-green-500 to-green-600 p-2 rounded-lg text-center">
              <div className="flex justify-center items-center gap-1 text-lg font-bold">
                <span className="text-yellow-300 text-xl">2</span><span>• 3 • 4 • 9 • 10 • 11 •</span><span className="text-yellow-300 text-xl">12</span>
              </div>
              <div className="text-sm font-bold">FIELD</div><div className="text-xs text-green-200">2 &amp; 12 pay double</div>
            </BetSpot>
            <BetSpot betKey="big8" className="w-14 bg-orange-600 hover:bg-orange-500 rounded-lg flex flex-col items-center justify-center p-2">
              <div className="text-xl font-bold">8</div><div className="text-xs">BIG</div>
            </BetSpot>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <BetSpot betKey="dontCome" className="bg-red-800 hover:bg-red-700 p-2 rounded-lg text-center font-bold">DON'T COME BAR</BetSpot>
            <BetSpot betKey="dontPass" className="bg-red-800 hover:bg-red-700 p-2 rounded-lg text-center font-bold">DON'T PASS BAR</BetSpot>
          </div>
          <div className="relative">
            <BetSpot betKey="pass" className="w-full bg-green-500 hover:bg-green-400 p-4 rounded-lg text-center text-2xl font-bold">PASS LINE</BetSpot>
            {point && bets.pass > 0 && (
              <div onClick={(e) => { e.stopPropagation(); placeBet('passOdds'); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); removeBet('passOdds'); }}
                className={`absolute left-2 top-1/2 -translate-y-1/2 bg-yellow-600 hover:bg-yellow-500 px-3 py-1 rounded text-sm cursor-pointer ${winningSpaces.includes('passOdds') ? 'win-glow' : ''}`}>
                ODDS {bets.passOdds > 0 && `$${bets.passOdds}`}
                {bets.passOdds > 0 && <div className="absolute -top-3 -right-3"><BetChip amount={bets.passOdds} /></div>}
              </div>
            )}
          </div>
        </div>
        
        {rollHistory.length > 0 && (
          <div className="bg-green-800/50 rounded-lg p-2 mb-2">
            <div className="flex flex-wrap gap-1">
              {rollHistory.map((roll, i) => (
                <div key={i} className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold ${roll === 7 ? 'bg-red-600' : [2,3,12].includes(roll) ? 'bg-yellow-600' : [4,5,6,8,9,10].includes(roll) ? 'bg-blue-600' : 'bg-green-600'}`}>{roll}</div>
              ))}
            </div>
          </div>
        )}
        
        <div className="bg-gradient-to-t from-gray-900 to-gray-800 rounded-lg p-3 border border-gray-700">
          <div className="flex items-center justify-center gap-3">
            {standardChips.map(val => (
              <Chip key={val} value={val} size={val === currentBet ? 54 : 46} selected={val === currentBet}
                onClick={() => setCurrentBet(val)} draggable={true} onDragStart={handleDragStart} />
            ))}
          </div>
          <div className="text-center text-xs text-gray-400 mt-2">Click to select • Drag to bet • Right-click to remove</div>
        </div>
        
        <div className="flex justify-between items-center mt-2 text-xs text-gray-400">
          <button onClick={() => { if(confirm('Reset all-time stats?')) resetAllTimeStats(); }} className="hover:text-red-400">Reset All-Time Stats</button>
          <div>Rolls: {sessionStats.totalRolls} • Won: ${sessionStats.totalWon} • Points: {sessionStats.pointsHit} • 7-outs: {sessionStats.sevenOuts}</div>
        </div>
      </div>
    </div>
  );
};

export default CrapsGame;
