import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import WaterUsageChart from "@/components/water-usage-chart";
import { useLocation } from "wouter";
import { CheckCircle2, RefreshCw, ClipboardList, Droplet, Edit } from "lucide-react";

export default function DashboardPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  
  const { data: dailyQuizCompleted } = useQuery({
    queryKey: ['/api/daily-quiz'],
    enabled: !!user,
  });
  
  const handleTakeDailyQuiz = () => {
    setLocation("/daily-quiz");
  };
  
  const handleUpdateDailyQuiz = () => {
    setLocation("/daily-quiz/update");
  };
  
  const handleRetakeInitialQuiz = () => {
    setLocation("/initial-quiz/retake");
  };
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Water Usage Summary */}
      <div className="lg:col-span-2">
        <WaterUsageChart />
      </div>
      
      {/* Daily Actions */}
      <div>
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-xl">Daily Actions</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyQuizCompleted ? (
              <div className="space-y-3">
                <Button 
                  className="w-full bg-gray-100 text-gray-700 font-medium py-3 px-4 rounded-md mb-1 flex items-center justify-center"
                  variant="outline"
                  disabled
                >
                  <CheckCircle2 className="mr-2 text-green-600" /> Daily Water Quiz Completed
                </Button>
                <Button 
                  onClick={handleUpdateDailyQuiz}
                  className="w-full border-primary text-primary font-medium py-3 px-4 rounded-md transition duration-300 flex items-center justify-center"
                  variant="outline"
                >
                  <Edit className="mr-2" /> Update Today's Quiz
                </Button>
              </div>
            ) : (
              <Button 
                onClick={handleTakeDailyQuiz}
                className="w-full bg-primary hover:bg-primary-dark text-white font-medium py-3 px-4 rounded-md transition duration-300 mb-3 flex items-center justify-center"
              >
                <ClipboardList className="mr-2" /> Take Daily Water Quiz
              </Button>
            )}
            
            <Button 
              onClick={handleRetakeInitialQuiz}
              className="w-full border-primary text-primary font-medium py-3 px-4 rounded-md transition duration-300 mt-3 flex items-center justify-center"
              variant="outline"
            >
              <RefreshCw className="mr-2" /> Retake Initial Quiz
            </Button>
            
            <div className="bg-neutral-100 rounded-md p-4 mt-4">
              <h3 className="font-medium text-neutral-700 mb-2">Water Saving Tips</h3>
              <ul className="text-sm text-neutral-600 space-y-2">
                <li className="flex items-start">
                  <Droplet className="text-primary text-sm mt-1 mr-2" />
                  <span>Turn off the tap while brushing your teeth to save up to 8 gallons per day.</span>
                </li>
                <li className="flex items-start">
                  <Droplet className="text-primary text-sm mt-1 mr-2" />
                  <span>Fix leaky faucets - a dripping faucet can waste 20 gallons per day.</span>
                </li>
                <li className="flex items-start">
                  <Droplet className="text-primary text-sm mt-1 mr-2" />
                  <span>Take shorter showers - every minute less saves about 2.5 gallons.</span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
