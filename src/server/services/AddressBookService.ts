import { ethers } from 'ethers';

// Define interface for Contact
interface Contact {
  id: string;
  name: string;
  surname: string;
  phoneNumber: string;
  walletAddress: string;
}

export class AddressBookService {
  private prisma: any;
  private dummyContacts: Contact[];

  constructor(prisma: any) {
    this.prisma = prisma;
    
    // Initialize with dummy contacts
    this.dummyContacts = [
      {
        id: '1',
        name: 'Mother',
        surname: 'Smith',
        phoneNumber: '+1234567890',
        walletAddress: '0xCa01AC1D6d8765963b7fEEb659EF75ef665547AA'
      },
      {
        id: '2',
        name: 'Father',
        surname: 'Smith',
        phoneNumber: '+1987654321',
        walletAddress: '0xCa01AC1D6d8765963b7fEEb659EF75ef665547AA'
      },
      {
        id: '3',
        name: 'Wife',
        surname: 'Johnson',
        phoneNumber: '+1122334455',
        walletAddress: '0xCa01AC1D6d8765963b7fEEb659EF75ef665547AA'
      },
      {
        id: '4',
        name: 'Daughter',
        surname: 'Smith',
        phoneNumber: '+1567891234',
        walletAddress: '0xCa01AC1D6d8765963b7fEEb659EF75ef665547AA'
      },
      {
        id: '5',
        name: 'Son',
        surname: 'Smith',
        phoneNumber: '+1456789012',
        walletAddress: '0xCa01AC1D6d8765963b7fEEb659EF75ef665547AA'
      }
    ];
  }

  /**
   * Get the full list of contacts
   * @returns Array of all contacts
   */
  async getContactList(): Promise<Contact[]> {
    // In a real implementation, this would fetch from the database
    // For now, return dummy data
    return this.dummyContacts;
  }

  /**
   * Find contacts by name (partial match)
   * @param name The name to search for
   * @returns Array of matching contacts
   */
  async findContactByName(name: string): Promise<Contact[]> {
    const searchTerm = name.toLowerCase();
    
    // Filter contacts that match the name (case insensitive)
    return this.dummyContacts.filter(contact => 
      contact.name.toLowerCase().includes(searchTerm) || 
      contact.surname.toLowerCase().includes(searchTerm)
    );
  }
}