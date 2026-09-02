import FoodBudgetAnalysis from '../../../FoodBudgetAnalysis.jsx';
import useFoodBudgetInsights from '../hooks/useFoodBudgetInsights.js';
import './FoodBudgetInsightsContainer.css';

export default function FoodBudgetInsightsContainer(props) {
  const insights = useFoodBudgetInsights(props);
  return <FoodBudgetAnalysis {...insights} />;
}
