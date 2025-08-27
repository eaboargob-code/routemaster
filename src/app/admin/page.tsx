import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { ArrowRight, Route, Users } from 'lucide-react';

export default function AdminPage() {
  return (
    <div className="grid gap-4 md:gap-8">
       <Card>
         <CardHeader>
           <CardTitle>Welcome, Admin!</CardTitle>
           <CardDescription>This is your central hub for managing school transportation.</CardDescription>
         </CardHeader>
         <CardContent>
           <p>From here, you can manage routes, and soon, drivers and supervisors.</p>
         </CardContent>
       </Card>
      
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
         <Card>
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">Manage Routes</CardTitle>
             <Route className="h-4 w-4 text-muted-foreground" />
           </a-4>
           <CardContent>
             <div className="text-2xl font-bold">Your Routes</div>
             <p className="text-xs text-muted-foreground">
               View, create, and manage all bus routes for your school.
             </p>
           </CardContent>
           <CardFooter>
             <Button asChild className="w-full">
               <Link href="/admin/routes">
                 Go to Routes <ArrowRight className="ml-2 h-4 w-4" />
               </Link>
             </Button>
           </CardFooter>
         </Card>
         <Card className="border-dashed flex flex-col">
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">Manage Drivers</CardTitle>
             <Users className="h-4 w-4 text-muted-foreground" />
           </CardHeader>
           <CardContent className="flex-1 flex flex-col items-center justify-center text-center">
             <div className="text-lg font-semibold">Coming Soon</div>
             <p className="text-xs text-muted-foreground">
              Driver management is on the way.
             </p>
           </CardContent>
         </Card>
       </div>
    </div>
  );
}
