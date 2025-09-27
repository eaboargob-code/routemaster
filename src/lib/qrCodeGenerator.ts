import QRCode from 'qrcode';
import { StudentQRData } from '@/components/QRScanner';

// Generate secure signature for QR code
const generateSignature = (studentId: string, schoolId: string, secretKey: string): string => {
  // Simple signature generation (in production, use proper cryptographic signatures)
  return btoa(`${studentId}-${schoolId}-${secretKey}`);
};

// Generate QR code data for a student
export const generateStudentQRData = (
  studentId: string,
  studentName: string,
  schoolId: string,
  secretKey?: string
): StudentQRData => {
  const key = secretKey || process.env.NEXT_PUBLIC_QR_SECRET_KEY || 'default-secret';
  
  return {
    studentId,
    studentName,
    schoolId,
    timestamp: Date.now(),
    signature: generateSignature(studentId, schoolId, key)
  };
};

// Generate QR code image as data URL
export const generateQRCodeImage = async (
  studentId: string,
  studentName: string,
  schoolId: string,
  options?: {
    width?: number;
    margin?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }
): Promise<string> => {
  const qrData = generateStudentQRData(studentId, studentName, schoolId);
  const qrString = JSON.stringify(qrData);
  
  const qrOptions = {
    width: options?.width || 256,
    margin: options?.margin || 2,
    color: {
      dark: options?.color?.dark || '#000000',
      light: options?.color?.light || '#FFFFFF'
    }
  };
  
  try {
    return await QRCode.toDataURL(qrString, qrOptions);
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
};

// Generate QR code as SVG string
export const generateQRCodeSVG = async (
  studentId: string,
  studentName: string,
  schoolId: string,
  options?: {
    width?: number;
    margin?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }
): Promise<string> => {
  const qrData = generateStudentQRData(studentId, studentName, schoolId);
  const qrString = JSON.stringify(qrData);
  
  const qrOptions = {
    width: options?.width || 256,
    margin: options?.margin || 2,
    color: {
      dark: options?.color?.dark || '#000000',
      light: options?.color?.light || '#FFFFFF'
    }
  };
  
  try {
    return await QRCode.toString(qrString, { type: 'svg', ...qrOptions });
  } catch (error) {
    console.error('Error generating QR code SVG:', error);
    throw new Error('Failed to generate QR code SVG');
  }
};

// Validate QR code data
export const validateQRData = (qrString: string, secretKey?: string): StudentQRData | null => {
  try {
    const qrData: StudentQRData = JSON.parse(qrString);
    
    // Validate structure
    if (!qrData.studentId || !qrData.studentName || !qrData.schoolId || !qrData.signature) {
      return null;
    }
    
    // Validate signature
    const key = secretKey || process.env.NEXT_PUBLIC_QR_SECRET_KEY || 'default-secret';
    const expectedSignature = generateSignature(qrData.studentId, qrData.schoolId, key);
    
    if (qrData.signature !== expectedSignature) {
      return null;
    }
    
    return qrData;
  } catch (error) {
    console.error('Error validating QR data:', error);
    return null;
  }
};

// Bulk generate QR codes for multiple students
export const generateBulkQRCodes = async (
  students: Array<{ id: string; name: string; schoolId: string }>,
  format: 'dataURL' | 'svg' = 'dataURL',
  options?: {
    width?: number;
    margin?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }
): Promise<Array<{ studentId: string; studentName: string; qrCode: string }>> => {
  const results = [];
  
  for (const student of students) {
    try {
      const qrCode = format === 'svg' 
        ? await generateQRCodeSVG(student.id, student.name, student.schoolId, options)
        : await generateQRCodeImage(student.id, student.name, student.schoolId, options);
      
      results.push({
        studentId: student.id,
        studentName: student.name,
        qrCode
      });
    } catch (error) {
      console.error(`Error generating QR code for student ${student.id}:`, error);
      // Continue with other students even if one fails
    }
  }
  
  return results;
};