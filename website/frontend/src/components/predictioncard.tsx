interface PredictionCardProps {
  title: string;
  value: string | number;
  icon?: string;
  trend?: "up" | "down" | "stable";
  subtitle?: string;
}

function PredictionCard({ title, value, icon, trend, subtitle }: PredictionCardProps) {
  return (
    <div className="prediction-card">
      <div className="prediction-card-header">
        {icon && <span className="prediction-card-icon">{icon}</span>}
        <h3 className="prediction-card-title">{title}</h3>
      </div>
      <div className="prediction-card-value">{value}</div>
      {trend && (
        <div className={`prediction-card-trend ${trend}`}>
          {trend === "up" && "↑ Increasing"}
          {trend === "down" && "↓ Decreasing"}
          {trend === "stable" && "→ Stable"}
        </div>
      )}
      {subtitle && <div className="prediction-card-subtitle">{subtitle}</div>}
    </div>
  );
}

export default PredictionCard;