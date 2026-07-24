import "../styles/card.css";

interface CardProps {
  title: string;
  value: string | number;
  subtitle?: string;
}

function Card({ title, value, subtitle }: CardProps) {
  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      <div className="card-value">{value}</div>
      {subtitle && <div className="card-subtitle">{subtitle}</div>}
    </div>
  );
}

export default Card;