"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Search
} from 'lucide-react';

export interface Student {
  id: string;
  name: string;
  grade?: string;
  photoUrl?: string;
  photoUrlThumb?: string;
  assignedRouteId?: string | null;
  assignedBusId?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  schoolId: string;
  parentPhone?: string;
  address?: string;
  coordinates?: { lat: number; lng: number };
  pickupTime?: string;
  dropoffTime?: string;
  specialNeeds?: string;
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
  medicalInfo?: string;
  busRoute?: string;
}

export interface PassengerStatus {
  studentId: string;
  status: "pending" | "boarded" | "dropped" | "absent" | "no_show";
  timestamp?: any;
  location?: { lat: number; lng: number };
  method?: "qr" | "manual" | "auto";
  notes?: string;
}

export interface EnhancedPassengerListProps {
  students: Student[];
  passengerStatuses: PassengerStatus[];
  onStatusUpdate: (studentId: string, status: PassengerStatus['status'], method?: string) => void;
  onCallParent: (studentId: string, phoneNumber?: string) => void;
  currentLocation?: { lat: number; lng: number };
  tripActive: boolean;
}

const EnhancedPassengerList: React.FC<EnhancedPassengerListProps> = ({
  students,
  passengerStatuses,
  onStatusUpdate,
  onCallParent,
  currentLocation,
  tripActive
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTab, setSelectedTab] = useState('all');
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  // Get student status from passengerStatuses
  const getStudentStatus = (studentId: string): PassengerStatus['status'] => {
    const status = passengerStatuses.find(ps => ps.studentId === studentId);
    return status?.status || 'pending';
  };

  // Filter and sort students based on search and tab
  const filteredStudents = useMemo(() => {
    let filtered = students.filter(student => 
      student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.grade?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.address?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Filter by tab
    if (selectedTab !== 'all') {
      filtered = filtered.filter(student => {
        const status = getStudentStatus(student.id);
        switch (selectedTab) {
          case 'pending':
            return status === 'pending';
          case 'boarded':
            return status === 'boarded';
          case 'completed':
            return status === 'dropped';
          case 'issues':
            return status === 'absent' || status === 'no_show';
          default:
            return true;
        }
      });
    }

    // Sort by status priority, then by name
    return filtered.sort((a, b) => {
      const statusA = getStudentStatus(a.id);
      const statusB = getStudentStatus(b.id);
      
      const statusPriority = { 'pending': 0, 'boarded': 1, 'dropped': 2, 'absent': 3, 'no_show': 4 };
      const priorityDiff = statusPriority[statusA] - statusPriority[statusB];
      
      if (priorityDiff !== 0) return priorityDiff;
      return a.name.localeCompare(b.name);
    });
  }, [students, searchTerm, selectedTab, passengerStatuses]);

  // Calculate status counts
  const statusCounts = useMemo(() => {
    const counts = {
      total: students.length,
      pending: 0,
      boarded: 0,
      completed: 0,
      issues: 0
    };

    students.forEach(student => {
      const status = getStudentStatus(student.id);
      switch (status) {
        case 'pending':
          counts.pending++;
          break;
        case 'boarded':
          counts.boarded++;
          break;
        case 'dropped':
          counts.completed++;
          break;
        case 'absent':
        case 'no_show':
          counts.issues++;
          break;
      }
    });

    return counts;
  }, [students, passengerStatuses]);



  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Passenger List</span>
          <Badge variant="outline" className="ml-2">
            {statusCounts.total} Total
          </Badge>
        </CardTitle>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search students..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </CardHeader>

      <CardContent>
        {/* Status Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="mb-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="all">
              All ({statusCounts.total})
            </TabsTrigger>
            <TabsTrigger value="pending">
              Pending ({statusCounts.pending})
            </TabsTrigger>
            <TabsTrigger value="boarded">
              Boarded ({statusCounts.boarded})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed ({statusCounts.completed})
            </TabsTrigger>
            <TabsTrigger value="issues">
              Issues ({statusCounts.issues})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={selectedTab} className="mt-4">
            {filteredStudents.length === 0 ? (
              <div className="text-center py-8">
                <User className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">No students found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredStudents.map((student) => {
                  const status = getStudentStatus(student.id);
                  const isExpanded = expandedStudent === student.id;
                  
                  return (
                    <Card key={student.id} className="border border-gray-200">
                      <CardContent className="p-3">
                        <div className="flex items-center space-x-3">
                          <Avatar className="w-8 h-8">
                            <AvatarImage 
                              src={student.photoUrlThumb || student.photoUrl} 
                              alt={student.name} 
                            />
                            <AvatarFallback>
                              {student.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-gray-900 truncate">
                              {student.name}
                            </h3>
                          </div>
                        </div>

                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default EnhancedPassengerList;