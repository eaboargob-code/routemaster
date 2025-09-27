'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { audioFeedbackService } from '@/lib/audioFeedback';
import { Volume2, VolumeX, CheckCircle, XCircle, UserPlus, UserMinus } from 'lucide-react';

export default function TestAudioPage() {
  const [isEnabled, setIsEnabled] = React.useState(true);
  const [volume, setVolume] = React.useState(0.5);

  const testSuccess = async () => {
    try {
      await audioFeedbackService.playSuccessSound();
    } catch (error) {
      console.error('Success sound failed:', error);
    }
  };

  const testError = async () => {
    try {
      await audioFeedbackService.playErrorSound();
    } catch (error) {
      console.error('Error sound failed:', error);
    }
  };

  const testBoarding = async () => {
    try {
      await audioFeedbackService.playBoardingSound();
    } catch (error) {
      console.error('Boarding sound failed:', error);
    }
  };

  const testDropping = async () => {
    try {
      await audioFeedbackService.playDroppingSound();
    } catch (error) {
      console.error('Dropping sound failed:', error);
    }
  };

  const toggleAudio = () => {
    const newState = !isEnabled;
    setIsEnabled(newState);
    audioFeedbackService.setEnabled(newState);
  };

  const updateVolume = (newVolume: number) => {
    setVolume(newVolume);
    audioFeedbackService.setVolume(newVolume);
  };

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-6 w-6" />
            Audio Feedback Test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Audio Controls */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Audio Enabled</span>
              <Button
                variant={isEnabled ? "default" : "outline"}
                size="sm"
                onClick={toggleAudio}
                className="flex items-center gap-2"
              >
                {isEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                {isEnabled ? 'Enabled' : 'Disabled'}
              </Button>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Volume: {Math.round(volume * 100)}%</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => updateVolume(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          {/* Test Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <Button
              onClick={testSuccess}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4" />
              Test Success
            </Button>
            
            <Button
              onClick={testError}
              variant="destructive"
              className="flex items-center gap-2"
            >
              <XCircle className="h-4 w-4" />
              Test Error
            </Button>
            
            <Button
              onClick={testBoarding}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <UserPlus className="h-4 w-4" />
              Test Boarding
            </Button>
            
            <Button
              onClick={testDropping}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700"
            >
              <UserMinus className="h-4 w-4" />
              Test Dropping
            </Button>
          </div>

          {/* Instructions */}
          <div className="text-sm text-gray-600 space-y-2">
            <p><strong>Instructions:</strong></p>
            <ul className="list-disc list-inside space-y-1">
              <li>Click each button to test different audio feedback sounds</li>
              <li>Success: High-pitched confirmation beep</li>
              <li>Error: Low-pitched error tone</li>
              <li>Boarding: Rising tone sequence</li>
              <li>Dropping: Descending tone sequence</li>
              <li>Adjust volume and enable/disable audio as needed</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}