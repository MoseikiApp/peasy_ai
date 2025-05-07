import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';

// Define interface for Contact
interface Contact {
  id: string;
  name: string;
  phoneNumber: string;
  walletAddress: string;
  telegramHandle: string;
}

export class AddressBookService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get the full list of contacts
   * @param userId The user ID to get contacts for
   * @returns Array of all contacts
   */
  async getContactList(userId: string): Promise<Contact[]> {
    const addressBookEntries = await this.prisma.addressBook.findMany({
      where: {
        userId: userId
      }
    });

    return addressBookEntries.map(entry => ({
      id: entry.id,
      name: entry.name,
      phoneNumber: entry.phoneNumberWithCountryCode || '',
      walletAddress: entry.walletAddress,
      telegramHandle: entry.telegramHandle || ''
    }));
  }

  /**
   * Find contacts by name (partial match)
   * @param userId The user ID to search contacts for
   * @param name The name to search for
   * @returns Array of matching contacts
   */
  async findContactByName(userId: string, name: string): Promise<Contact[]> {
    // First try exact partial match
    const exactMatches = await this.prisma.addressBook.findMany({
      where: {
        userId: userId,
        name: {
          contains: name,
          mode: 'insensitive'
        }
      }
    });

    // If we found matches, return them
    if (exactMatches.length > 0) {
      return exactMatches.map(entry => ({
        id: entry.id,
        name: entry.name,
        phoneNumber: entry.phoneNumberWithCountryCode || '',
        walletAddress: entry.walletAddress,
        telegramHandle: entry.telegramHandle || ''
      }));
    }

    // If no exact matches, try fuzzy search
    // This is a simple implementation - in production you might want to use 
    // a more sophisticated fuzzy search algorithm or trigram search if PostgreSQL supports it
    const allContacts = await this.prisma.addressBook.findMany({
      where: {
        userId: userId
      }
    });

    const searchTerm = name.toLowerCase();
    const fuzzyMatches = allContacts.filter(contact => {
      // Split name into parts and check if any part starts with the search term
      const nameParts = contact.name.toLowerCase().split(' ');
      return nameParts.some(part => part.startsWith(searchTerm));
    });

    return fuzzyMatches.map(entry => ({
      id: entry.id,
      name: entry.name,
      phoneNumber: entry.phoneNumberWithCountryCode || '',
      telegramHandle: entry.telegramHandle || '',
      walletAddress: entry.walletAddress
    }));
  }

  /**
   * Add a new contact to the address book
   * @param userId The user ID
   * @param name The contact name
   * @param walletAddress The wallet address
   * @param telegramHandle Optional telegram handle
   * @returns The created contact
   */
  async addContact(
    userId: string,
    name: string,
    walletAddress: string,
    telegramHandle?: string
  ): Promise<Contact> {

    if (!ethers.isAddress(walletAddress)) {
      throw new Error(`Invalid Ethereum address format: ${walletAddress}`);
    }
    
    const entry = await this.prisma.addressBook.create({
      data: {
        userId,
        name,
        walletAddress,
        telegramHandle
      }
    });

    return {
      id: entry.id,
      name: entry.name,
      phoneNumber: entry.phoneNumberWithCountryCode || '',
      telegramHandle: entry.telegramHandle || '',
      walletAddress: entry.walletAddress,
    };
  }

  /**
   * Update an existing contact
   * @param contactId The ID of the contact to update
   * @param userId The user ID (for security verification)
   * @param data The contact data to update
   * @returns The updated contact
   */
  async updateContact(
    userId: string,
    name: string,
    data: {
      name?: string;
      walletAddress?: string;
      telegramHandle?: string;
      phoneNumberWithCountryCode?: string;
    }
  ): Promise<Contact | null> {
    // First verify the contact belongs to this user
    const existingContact = await this.prisma.addressBook.findFirst({
      where: {
        name: name,
        userId: userId
      }
    });

    if (!existingContact) {
      return null;
    }

    const updatedContact = await this.prisma.addressBook.update({
      where: {
        id: existingContact.id
      },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        walletAddress: data.walletAddress !== undefined ? data.walletAddress : undefined,
        telegramHandle: data.telegramHandle !== undefined ? data.telegramHandle : undefined,
        phoneNumberWithCountryCode: data.phoneNumberWithCountryCode !== undefined ? data.phoneNumberWithCountryCode : undefined,
        updatedAt: new Date()
      }
    });

    return {
      id: updatedContact.id,
      name: updatedContact.name,
      phoneNumber: updatedContact.phoneNumberWithCountryCode || '',
      telegramHandle: updatedContact.telegramHandle || '',
      walletAddress: updatedContact.walletAddress
    };
  }

  /**
   * Remove a contact from the address book
   * @param contactId The ID of the contact to remove
   * @param userId The user ID (for security verification)
   * @returns True if contact was removed, false if not found or not authorized
   */
  async removeContact(userId: string, name: string): Promise<boolean> {
    try {
      // Verify contact exists and belongs to user before deletion
      const existingContact = await this.prisma.addressBook.findFirst({
        where: {
          name: name,
          userId: userId
        }
      });

      if (!existingContact) {
        return false;
      }

      await this.prisma.addressBook.delete({
        where: {
          id: existingContact.id
        }
      });

      return true;
    } catch (error) {
      console.error('Error removing contact:', error);
      return false;
    }
  }
}