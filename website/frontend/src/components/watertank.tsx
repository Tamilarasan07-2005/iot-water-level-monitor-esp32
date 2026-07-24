import "../styles/watertank.css";

interface WaterTankProps {
  level: number; // 0-100 percentage
}

function WaterTank({ level }: WaterTankProps) {
  const waterHeight = Math.min(100, Math.max(0, level));
  
  return (
    <div className="water-tank">
      <div className="tank-container">
        <div className="tank-outline">
          <div 
            className="water-fill" 
            style={{ height: `${waterHeight}%` }}
          >
            <div className="water-wave"></div>
          </div>
        </div>
        <div className="level-markers">
          <div className="marker">100%</div>
          <div className="marker">75%</div>
          <div className="marker">50%</div>
          <div className="marker">25%</div>
          <div className="marker">0%</div>
        </div>
      </div>
      <div className="tank-base"></div>
    </div>
  );
}

export default WaterTank;