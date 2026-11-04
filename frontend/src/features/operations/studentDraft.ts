import type { Student } from './DemoDataProvider'

export const blankStudent = (): Omit<Student, 'id'> => ({ name: '', phone: '', birthDate: '', address: '', shirtSize: '', shortsSize: '', weeklyClasses: '1', days: '', class1: '', class2: '', monthlyAmount: 0, paymentStatus: 'A confirmar', paymentDate: '', statementName: '', status: 'A confirmar', notes: '' })
